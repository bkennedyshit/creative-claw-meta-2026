import type { CreativeStudioController, CreativeStudioHost } from "./creative-studio.ts";

export type CreativeRevision = {
  index: number;
  kind: "edit" | "correction";
  request: string;
  status: "succeeded" | "failed";
  planner?: { provider: string; model: string; attempts: number; usage?: Record<string, number> };
  plan?: {
    summary: string;
    steps: { capability: string; parameters: Record<string, unknown>; reason?: string }[];
  };
  artifactId?: string;
  previewUrl?: string;
  outputPath?: string;
  nodes?: { nodeId: string; capability: string; status: string; durationMs: number }[];
  error?: string;
  rejectedReply?: string;
  sourceUnchanged: boolean;
  createdAt: string;
};
export type CreativeRevisionSession = {
  id: string;
  sourcePath: string;
  sourceType: string;
  sourceHash: string;
  instruction: string;
  revisions: CreativeRevision[];
  exports: { path: string; revision: number; contentHash: string; exportedAt: string }[];
  createdAt: string;
  updatedAt: string;
};
type RevisionForm = { input: string; instruction: string; feedback: string; exportPath: string };
type RevisionResult = { session: CreativeRevisionSession; revision: CreativeRevision };
type RevisionMethods = {
  "creative.studio.revision.start": RevisionResult;
  "creative.studio.revision.correct": RevisionResult;
  "creative.studio.revision.export": {
    session: CreativeRevisionSession;
    export: { path: string; revision: number };
  };
};

export function plannerLabel(revision: CreativeRevision) {
  const planner = revision.planner;
  if (!planner) {
    return "";
  }
  const attempts = planner.attempts === 1 ? "1 attempt" : `${planner.attempts} attempts`;
  return `planned by ${planner.provider}/${planner.model} · ${attempts}`;
}

/** Drives the describe -> preview -> correct -> export loop; the gateway plans and runs each revision. */
export class CreativeRevisionController {
  session?: CreativeRevisionSession;
  sessions: CreativeRevisionSession[] = [];
  form: RevisionForm = { input: "", instruction: "", feedback: "", exportPath: "" };
  busy = false;
  message?: { ok: boolean; text: string };
  constructor(
    private host: CreativeStudioHost,
    private studio: CreativeStudioController,
  ) {}

  updateForm(patch: Partial<RevisionForm>) {
    this.form = { ...this.form, ...patch };
    this.host.requestUpdate();
  }

  async load() {
    if (!this.host.client || !this.host.connected || this.busy) {
      return;
    }
    try {
      const result = await this.host.client.request<{ sessions?: CreativeRevisionSession[] }>(
        "creative.studio.revision.list",
        {},
      );
      this.sessions = result.sessions ?? [];
      const current = this.sessions.find((entry) => entry.id === this.session?.id);
      this.restore(current ?? this.sessions[0]);
    } catch {
      /* Sessions are durable server-side; the gateway connection owns reconnection. */
    }
    this.host.requestUpdate();
  }

  select(sessionId: string) {
    this.restore(this.sessions.find((entry) => entry.id === sessionId));
    this.message = undefined;
    this.host.requestUpdate();
  }

  async start() {
    const input = this.form.input.trim();
    const instruction = this.form.instruction.trim();
    if (!input || !instruction) {
      this.fail(
        input ? "Describe the edit you want." : "Enter the absolute path of the source file.",
      );
      return;
    }
    await this.call("creative.studio.revision.start", { input, instruction }, (r) =>
      this.acceptRevision(r),
    );
  }

  async correct() {
    const feedback = this.form.feedback.trim();
    if (!this.session || !feedback) {
      this.fail(this.session ? "Describe what to change." : "Start an edit before correcting it.");
      return;
    }
    await this.call(
      "creative.studio.revision.correct",
      { id: this.session.id, feedback },
      async (result) => {
        this.form = { ...this.form, feedback: "" };
        await this.acceptRevision(result);
      },
    );
  }

  async export(revision?: number) {
    const output = this.form.exportPath.trim();
    if (!this.session || !output) {
      this.fail(
        this.session ? "Enter a new absolute file path to export to." : "Start an edit first.",
      );
      return;
    }
    const params = { id: this.session.id, output, ...(revision ? { revision } : {}) };
    await this.call("creative.studio.revision.export", params, (result) => {
      this.accept(result.session);
      this.message = {
        ok: true,
        text: `Exported revision ${result.export.revision} to ${result.export.path}`,
      };
    });
  }

  async previewRevision(revision: CreativeRevision) {
    if (!this.session || !revision.artifactId || !revision.outputPath) {
      return;
    }
    await this.studio.showPreview({
      id: revision.artifactId,
      path: revision.outputPath,
      type: this.session.sourceType,
      previewUrl: revision.previewUrl,
    });
  }

  private restore(session?: CreativeRevisionSession) {
    this.session = session;
    if (session && !this.form.input) {
      this.form = { ...this.form, input: session.sourcePath, instruction: session.instruction };
    }
  }

  private accept(session: CreativeRevisionSession) {
    this.session = session;
    this.sessions = [session, ...this.sessions.filter((entry) => entry.id !== session.id)];
  }

  private async acceptRevision({ session, revision }: RevisionResult) {
    this.accept(session);
    void this.studio.refreshGpu();
    if (revision.status === "failed") {
      const planner = plannerLabel(revision);
      const detail = revision.error || "No error was reported";
      this.message = {
        ok: false,
        text: `Revision ${revision.index} failed: ${detail}${planner ? ` (${planner})` : ""}`,
      };
      return;
    }
    this.message = {
      ok: true,
      text: `Revision ${revision.index} ready: ${revision.plan?.summary}`,
    };
    await this.previewRevision(revision);
  }

  private fail(text: string) {
    this.message = { ok: false, text };
    this.host.requestUpdate();
  }

  private async call<M extends keyof RevisionMethods>(
    method: M,
    params: Record<string, unknown>,
    accept: (result: RevisionMethods[M]) => void | Promise<void>,
  ) {
    const client = this.host.client;
    if (!client || !this.host.connected) {
      this.fail("Gateway not connected");
      return;
    }
    if (
      method !== "creative.studio.revision.export" &&
      (this.studio.gpuBusy || this.studio.gpu.leaseOwner)
    ) {
      this.fail("Return GPU to app before planning another edit.");
      return;
    }
    if (this.busy) {
      return;
    }
    this.busy = true;
    this.message = undefined;
    this.host.requestUpdate();
    try {
      const result = await client.request<RevisionMethods[M] & { ok?: boolean; error?: string }>(
        method,
        params,
      );
      if (result.ok === false || result.error !== undefined) {
        throw new Error(result.error || `${method} failed without an error message`);
      }
      await accept(result);
    } catch (error) {
      this.message = { ok: false, text: error instanceof Error ? error.message : String(error) };
    } finally {
      this.busy = false;
      this.host.requestUpdate();
    }
  }
}
