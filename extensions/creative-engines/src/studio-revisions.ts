import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { copyFile, rm, stat } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import type { CreativeCapabilityDescriptor } from "@openclaw/creative-contracts";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import type { PluginStateKeyedStore } from "openclaw/plugin-sdk/plugin-state-runtime";
import sharp from "sharp";
import { getAllCreativeCapabilities, validateOperationParameters } from "./capabilities.js";
import { probeDurationSec, type CodecConfig } from "./ffi/codec.js";
import type { ExecutionEngine } from "./graph/executor.js";
import { isStudioFileType, type StudioFileType } from "./studio-graph.js";
import { buildLinearStudioGraph, type Step } from "./studio-recipes.js";
import { fileIdentity, type CreativeStudio } from "./studio.js";

/** Host model call. Production binds runtime.llm.complete; the agent's configured model answers. */
export type RevisionPlanner = (request: { system: string; prompt: string }) => Promise<{
  text: string;
  provider: string;
  model: string;
  usage?: Record<string, number>;
}>;

type PlanStep = { capability: string; parameters: Record<string, unknown>; reason?: string };
type Plan = { summary: string; steps: PlanStep[] };
type Revision = {
  index: number;
  kind: "edit" | "correction";
  request: string;
  status: "succeeded" | "failed";
  createdAt: string;
  planner?: {
    provider: string;
    model: string;
    attempts: number;
    usage?: Record<string, number>;
  };
  plan?: Plan;
  artifactId?: string;
  previewUrl?: string;
  outputPath?: string;
  nodes?: { nodeId: string; capability: string; status: string; durationMs: number }[];
  error?: string;
  rejectedReply?: string;
  sourceUnchanged: boolean;
};
type RevisionExport = { path: string; revision: number; contentHash: string; exportedAt: string };
export type RevisionSession = {
  id: string;
  sourcePath: string;
  sourceType: StudioFileType;
  sourceHash: string;
  instruction: string;
  revisions: Revision[];
  exports: RevisionExport[];
  createdAt: string;
  updatedAt: string;
};

const MAX_STEPS = 6;
const MAX_TEXT = 2000;
const MAX_REVISIONS = 20;
const SOURCE_TYPES: Record<string, StudioFileType> = {
  ".png": "image",
  ".jpg": "image",
  ".jpeg": "image",
  ".webp": "image",
  ".mp4": "video",
  ".mov": "video",
  ".webm": "video",
  ".mkv": "video",
  ".wav": "audio",
  ".mp3": "audio",
  ".flac": "audio",
  ".svg": "vector",
};

const SYSTEM_PROMPT = `You plan media edits for Creative Claw Studio. You never edit media yourself: you pick operations from the catalog, and native engines run them on the user's file.
Reply with exactly one JSON object and nothing else (no prose, no code fences):
{"summary":"<one sentence describing the edit>","steps":[{"capability":"<catalog id>","parameters":{},"reason":"<short reason>"}]}
Rules:
- Use only catalog ids, 1-${MAX_STEPS} steps. The first step must accept the source type. Each later step must accept the previous step's output type.
- Use only the listed parameters, inside their bounds. Omit a parameter to keep its default.
- Do what was asked and nothing extra.
- Every plan is applied to the untouched original source. For a correction, return the complete revised plan, not a delta.
- If the catalog cannot do the request, reply {"summary":"<why not>","steps":[]}.`;

function text(value: unknown, field: string) {
  const result = typeof value === "string" ? value.trim() : "";
  if (!result || result.length > MAX_TEXT) {
    throw new Error(`${field} must be 1-${MAX_TEXT} characters`);
  }
  return result;
}

/** Single-file operations Studio can chain, on engines that loaded on this gateway. */
async function availableCatalog(engines: Record<string, ExecutionEngine>) {
  const ready = new Map<string, boolean>();
  for (const [name, engine] of Object.entries(engines)) {
    await engine.ensureStarted();
    ready.set(name, engine.isAvailable());
  }
  const catalog = new Map<
    string,
    { cap: CreativeCapabilityDescriptor; from: string; to: string }
  >();
  for (const cap of getAllCreativeCapabilities()) {
    const inputs = Object.values(cap.inputs);
    const outputs = Object.values(cap.outputs);
    if (
      ready.get(cap.id.split(".")[0]) &&
      inputs.length === 1 &&
      outputs.length === 1 &&
      isStudioFileType(inputs[0].dataType) &&
      isStudioFileType(outputs[0].dataType)
    ) {
      catalog.set(cap.id, { cap, from: inputs[0].dataType, to: outputs[0].dataType });
    }
  }
  return catalog;
}

function describeCatalog(catalog: Awaited<ReturnType<typeof availableCatalog>>) {
  return [...catalog.values()]
    .map(({ cap, from, to }) => {
      const properties = (cap.parametersSchema.properties ?? {}) as Record<
        string,
        { type?: string; minimum?: number; maximum?: number; enum?: string[]; default?: unknown }
      >;
      const params = Object.entries(properties).map(([name, p]) => {
        const bounds = [
          p.enum ? p.enum.join("|") : p.type,
          p.minimum !== undefined || p.maximum !== undefined
            ? `${p.minimum ?? ""}..${p.maximum ?? ""}`
            : "",
          p.default !== undefined ? `default ${JSON.stringify(p.default)}` : "",
        ].filter(Boolean);
        return `${name}(${bounds.join(", ")})`;
      });
      return `${cap.id} [${from}->${to}] ${cap.description.slice(0, 140)}${params.length ? ` | params: ${params.join("; ")}` : ""}`;
    })
    .join("\n");
}

function parsePlan(reply: string): Plan {
  const start = reply.indexOf("{");
  const end = reply.lastIndexOf("}");
  if (start < 0 || end < start) {
    throw new Error("Reply contained no JSON object");
  }
  const raw = JSON.parse(reply.slice(start, end + 1)) as Record<string, unknown>;
  if (typeof raw.summary !== "string" || !Array.isArray(raw.steps)) {
    throw new Error('Reply needs "summary" (string) and "steps" (array)');
  }
  const steps = raw.steps.map((entry, index) => {
    const step = entry as Record<string, unknown>;
    const parameters = step?.parameters ?? {};
    if (typeof step?.capability !== "string" || typeof parameters !== "object" || !parameters) {
      throw new Error(`Step ${index + 1} needs a capability id and a parameters object`);
    }
    return {
      capability: step.capability,
      parameters: parameters as Record<string, unknown>,
      ...(typeof step.reason === "string" ? { reason: step.reason.slice(0, 300) } : {}),
    };
  });
  return { summary: raw.summary.slice(0, 500), steps };
}

/** Reject plans the engines cannot run before any media is touched; resolve parameter defaults. */
function checkPlan(
  plan: Plan,
  sourceType: StudioFileType,
  catalog: Awaited<ReturnType<typeof availableCatalog>>,
): Plan {
  if (plan.steps.length === 0) {
    throw new Error(`The model declined: ${plan.summary}`);
  }
  if (plan.steps.length > MAX_STEPS) {
    throw new Error(`Plans are limited to ${MAX_STEPS} steps`);
  }
  let current: string = sourceType;
  const steps = plan.steps.map((step, index) => {
    const entry = catalog.get(step.capability);
    if (!entry) {
      throw new Error(
        `Step ${index + 1}: ${step.capability} is not an available operation on this gateway`,
      );
    }
    if (entry.from !== current) {
      throw new Error(`Step ${index + 1}: ${step.capability} needs ${entry.from}, got ${current}`);
    }
    const validation = validateOperationParameters(entry.cap, step.parameters);
    if (!validation.valid) {
      throw new Error(`Step ${index + 1}: ${validation.errors.join("; ")}`);
    }
    current = entry.to;
    return { ...step, parameters: validation.resolvedParams };
  });
  return { summary: plan.summary, steps };
}

/**
 * A creator's edit request and its corrections. Each revision asks the model for a plan,
 * validates it against the live catalog, and runs it natively on the original source.
 */
export class RevisionSessions {
  private busy = new Set<string>();
  constructor(
    private studio: CreativeStudio,
    private store: PluginStateKeyedStore<RevisionSession>,
    private engines: Record<string, ExecutionEngine>,
    private planner: RevisionPlanner,
    private codec?: CodecConfig,
  ) {}

  async list() {
    return (await this.store.entries())
      .map((entry) => entry.value)
      .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 20);
  }

  async get(id: string) {
    const session = await this.store.lookup(id);
    if (!session) {
      throw new Error("Revision session not found");
    }
    return session;
  }

  async start(params: Record<string, unknown>) {
    const instruction = text(params.instruction, "Edit request");
    const sourcePath = resolve(text(params.input, "Source path"));
    const sourceType = SOURCE_TYPES[extname(sourcePath).toLowerCase()];
    if (!sourceType) {
      throw new Error(`Unsupported source type: ${extname(sourcePath) || "no extension"}`);
    }
    const identity = await fileIdentity(sourcePath).catch((error: unknown) => {
      const missing = (error as NodeJS.ErrnoException).code === "ENOENT";
      throw missing ? new Error(`Source not found: ${sourcePath}`) : error;
    });
    const now = new Date().toISOString();
    const session: RevisionSession = {
      id: `revision-${randomUUID()}`,
      sourcePath,
      sourceType,
      sourceHash: identity.contentHash,
      instruction,
      revisions: [],
      exports: [],
      createdAt: now,
      updatedAt: now,
    };
    await this.store.register(session.id, session);
    return this.locked(session.id, (current) => this.revise(current, "edit", instruction));
  }

  async correct(params: Record<string, unknown>) {
    const id = typeof params.id === "string" ? params.id : "";
    return this.locked(id, (session) => {
      if (session.revisions.length >= MAX_REVISIONS) {
        throw new Error(`A session holds up to ${MAX_REVISIONS} revisions; start a new edit`);
      }
      return this.revise(session, "correction", text(params.feedback, "Correction"));
    });
  }

  /**
   * One writer per session. The session is re-read inside the lock and the lock is held until
   * the store write, so a concurrent correction or export cannot persist a stale copy over it.
   */
  private async locked<T>(id: string, run: (session: RevisionSession) => Promise<T>) {
    if (this.busy.has(id)) {
      throw new Error("This edit is already running; wait for its preview");
    }
    this.busy.add(id);
    try {
      return await run(await this.get(id));
    } finally {
      this.busy.delete(id);
    }
  }

  private async revise(session: RevisionSession, kind: Revision["kind"], request: string) {
    const revision: Revision = {
      index: session.revisions.length + 1,
      kind,
      request,
      status: "failed",
      createdAt: new Date().toISOString(),
      sourceUnchanged: false,
    };
    try {
      await this.plan(session, revision);
      const steps: Step[] = revision.plan!.steps.map((s) => [s.capability, s.parameters]);
      const graph = buildLinearStudioGraph(
        `Revision ${revision.index}: ${revision.plan!.summary}`.slice(0, 120),
        session.sourceType,
        steps,
        { revisionSessionId: session.id, revision: revision.index, sourcePath: session.sourcePath },
      );
      const result = await this.studio.runGraph(graph, session.sourcePath);
      revision.status = "succeeded";
      revision.artifactId = result.artifact.id;
      revision.previewUrl = `/plugins/creative-engines/artifacts/${result.artifact.id}`;
      revision.outputPath = result.output;
      revision.nodes = result.nodes.map((node) => ({
        nodeId: node.node_id,
        capability: graph.nodes.find((entry) => entry.id === node.node_id)?.capability ?? "",
        status: node.status,
        durationMs: node.duration_ms ?? 0,
      }));
    } catch (error) {
      revision.error = error instanceof Error ? error.message : String(error);
    }
    // Re-hash after every run: the UI shows proof that the creator's file was never written.
    revision.sourceUnchanged = await fileIdentity(session.sourcePath)
      .then((identity) => identity.contentHash === session.sourceHash)
      .catch(() => false);
    session.revisions.push(revision);
    session.updatedAt = new Date().toISOString();
    await this.store.register(session.id, session);
    return { session, revision };
  }

  private async plan(session: RevisionSession, revision: Revision) {
    const catalog = await availableCatalog(this.engines);
    if (![...catalog.values()].some((entry) => entry.from === session.sourceType)) {
      throw new Error(`No ${session.sourceType} engine is available on this gateway`);
    }
    const previous = session.revisions.findLast((entry) => entry.status === "succeeded")?.plan;
    const prompt = [
      `Source: ${session.sourceType} file "${basename(session.sourcePath)}"${await this.describeSource(session)}`,
      `Request: ${session.instruction}`,
      ...(revision.kind === "correction"
        ? [
            ...(previous
              ? [`Previous plan (applied to the original source): ${JSON.stringify(previous)}`]
              : []),
            `Correction from the creator: ${revision.request}`,
            "Return the complete revised plan, applied to the original source.",
          ]
        : []),
      "Catalog (id [input->output] description | params):",
      describeCatalog(catalog),
    ].join("\n");
    let rejection = "";
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const reply = await this.planner({
        system: SYSTEM_PROMPT,
        prompt: rejection
          ? `${prompt}\nYour previous reply was rejected: ${rejection}\nReply again with corrected JSON only.`
          : prompt,
      });
      revision.planner = {
        provider: reply.provider,
        model: reply.model,
        attempts: attempt,
        ...(reply.usage ? { usage: reply.usage } : {}),
      };
      try {
        revision.plan = checkPlan(parsePlan(reply.text), session.sourceType, catalog);
        return;
      } catch (error) {
        rejection = error instanceof Error ? error.message : String(error);
        revision.rejectedReply = reply.text.slice(0, 1500);
        // A declined request is an answer, not a formatting mistake; do not re-ask.
        if (rejection.startsWith("The model declined")) {
          break;
        }
      }
    }
    throw new Error(`Plan rejected: ${rejection}`);
  }

  private async describeSource(session: RevisionSession) {
    try {
      if (session.sourceType === "image") {
        const meta = await sharp(session.sourcePath).metadata();
        return `, ${meta.width}x${meta.height} ${meta.format}${meta.hasAlpha ? " with alpha" : ""}`;
      }
      if (session.sourceType === "video" || session.sourceType === "audio") {
        const duration = await probeDurationSec(session.sourcePath, this.codec);
        return duration ? `, ${duration.toFixed(2)} s` : "";
      }
    } catch {
      /* Metadata only improves the prompt; the native run reports unreadable media. */
    }
    return "";
  }

  /** Copy a reviewed revision to a new file. Never overwrites; verifies the copied bytes. */
  async export(params: Record<string, unknown>) {
    const id = typeof params.id === "string" ? params.id : "";
    return this.locked(id, (session) => this.exportRevision(session, params));
  }

  private async exportRevision(session: RevisionSession, params: Record<string, unknown>) {
    const wanted = typeof params.revision === "number" ? params.revision : undefined;
    const revision = wanted
      ? session.revisions.find((entry) => entry.index === wanted)
      : session.revisions.findLast((entry) => entry.status === "succeeded");
    if (!revision || revision.status !== "succeeded" || !revision.artifactId) {
      throw new Error("Choose a revision with a completed preview to export");
    }
    const artifact = await this.studio.artifactFile(revision.artifactId);
    if (!artifact) {
      throw new Error("The preview's saved output is no longer recorded");
    }
    const output = resolve(text(params.output, "Export path"));
    const expected = extname(artifact.path).toLowerCase();
    if (extname(output).toLowerCase() !== expected) {
      throw new Error(`Export path must end in ${expected} to match the revision's media`);
    }
    if (output === session.sourcePath) {
      throw new Error("Export path is the original source; choose a new file");
    }
    const exists = await stat(output).then(
      () => true,
      () => false,
    );
    if (exists) {
      throw new Error("Export path already exists; choose a new file to preserve it");
    }
    const source = await fileIdentity(artifact.path);
    await copyFile(artifact.path, output, constants.COPYFILE_EXCL);
    const copied = await fileIdentity(output);
    if (copied.contentHash !== source.contentHash) {
      await rm(output, { force: true });
      throw new Error("Exported bytes did not match the preview; the export was removed");
    }
    const record: RevisionExport = {
      path: output,
      revision: revision.index,
      contentHash: copied.contentHash,
      exportedAt: new Date().toISOString(),
    };
    session.exports.push(record);
    session.updatedAt = record.exportedAt;
    await this.store.register(session.id, session);
    return { session, export: record };
  }
}

export function registerStudioRevisions(
  api: OpenClawPluginApi,
  studio: CreativeStudio,
  engines: Record<string, ExecutionEngine>,
  codec?: CodecConfig,
) {
  const planner: RevisionPlanner = async ({ system, prompt }) => {
    // The default agent's configured model plans; the launcher points it at Meta Model API.
    const result = await api.runtime.llm.complete({
      systemPrompt: system,
      messages: [{ role: "user", content: prompt }],
      // Muse Spark reasoning tokens share this budget with the JSON reply.
      maxTokens: 16000,
      purpose: "Creative Studio revision plan",
    });
    const usage = Object.fromEntries(
      Object.entries(result.usage).filter(
        (entry): entry is [string, number] => typeof entry[1] === "number",
      ),
    );
    return { text: result.text, provider: result.provider, model: result.model, usage };
  };
  const sessions = new RevisionSessions(
    studio,
    api.runtime.state.openKeyedStore<RevisionSession>({
      namespace: "studio-revisions",
      maxEntries: 500,
    }),
    engines,
    planner,
    codec,
  );
  const methods: Record<string, (params: Record<string, unknown>) => Promise<unknown>> = {
    "creative.studio.revision.start": (params) => sessions.start(params),
    "creative.studio.revision.correct": (params) => sessions.correct(params),
    "creative.studio.revision.export": (params) => sessions.export(params),
    "creative.studio.revision.get": async (params) => ({
      session: await sessions.get(typeof params.id === "string" ? params.id : ""),
    }),
    "creative.studio.revision.list": async () => ({ sessions: await sessions.list() }),
  };
  for (const [name, handler] of Object.entries(methods)) {
    api.registerGatewayMethod(name, async ({ params, respond }) => {
      try {
        respond(true, await handler(params ?? {}));
      } catch (error) {
        respond(true, { ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    });
  }
}
