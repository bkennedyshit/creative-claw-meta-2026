import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const META_ENDPOINT = "https://api.meta.ai/v1";
export const DEFAULT_MODEL = "muse-spark-1.3";
export const DEFAULT_PORT = 18991;
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultState = path.join(homedir(), ".creativeclaw-meta-2026");
// Ports already used by the original gateway and the sibling Nebius event copy.
const RESERVED_PORTS = new Set([18789, 18990]);

export function pathsFor(stateDir = defaultState, local = false) {
  const state = path.resolve(stateDir, local ? "local" : "sponsor");
  return {
    state,
    config: path.join(state, "creativeclaw.json"),
    workspace: path.join(state, "workspace"),
  };
}

export function buildConfig({
  paths,
  local = false,
  model = DEFAULT_MODEL,
  port = DEFAULT_PORT,
  token,
  assetExists = existsSync,
}) {
  if (!/^muse-[a-z]+-\d+(\.\d+)*(-contributor)?$/.test(model)) {
    throw new Error(
      "Select a Muse model ID from the Meta Model API catalog (for example muse-spark-1.3).",
    );
  }
  if (!Number.isInteger(port) || port < 1024 || port > 65535 || RESERVED_PORTS.has(port)) {
    throw new Error(
      "Use a dedicated port from 1024 to 65535, different from the original (18789) and Nebius (18990) gateways.",
    );
  }
  const defaults = { workspace: paths.workspace, skipBootstrap: true, heartbeat: { every: "0m" } };
  if (!local) {
    defaults.model = { primary: `meta/${model}` };
  }
  // Built plugins resolve a different bundled directory; use the provisioned source assets explicitly.
  const nativeAssets = path.join(repo, "extensions", "creative-engines", "binaries");
  const vfxLibrary =
    process.platform === "win32"
      ? "omni_video_bridge.dll"
      : process.platform === "darwin"
        ? "libomni_video_bridge.dylib"
        : "libomni_video_bridge.so";
  const vfxPath = path.join(nativeAssets, "vfx", vfxLibrary);
  const engines = {
    image: { binaryPath: nativeAssets },
    audio: { binaryPath: nativeAssets },
    video: { binaryPath: nativeAssets },
    vector: { binaryPath: nativeAssets },
    ...(assetExists(vfxPath) ? { vfx: { binaryPath: vfxPath } } : {}),
  };
  return {
    agents: {
      defaults,
      list: [{ id: "creative-meta", default: true, name: "Creative Claw Meta" }],
    },
    tools: { allow: ["creative-engines", "visual-memory", "gpu-broker"] },
    plugins: {
      allow: ["creative-engines", "visual-memory", "gpu-broker"],
      entries: {
        "creative-engines": { enabled: true, config: engines },
        // This plugin's inherited default uses a shared home path, not OPENCLAW_STATE_DIR.
        "visual-memory": {
          enabled: true,
          config: { storePath: path.join(paths.state, "visual-memory") },
        },
        "gpu-broker": { enabled: true },
      },
    },
    gateway: { mode: "local", port, bind: "loopback", auth: { mode: "token", token } },
    ...(!local
      ? {
          models: {
            providers: {
              meta: {
                baseUrl: META_ENDPOINT,
                // Meta recommends Responses for tool loops: it replays encrypted reasoning.
                api: "openai-responses",
                apiKey: { source: "env", provider: "default", id: "MODEL_API_KEY" },
                models: [
                  {
                    id: model,
                    name: "Muse Spark on Meta Model API",
                    reasoning: true,
                    input: ["text", "image"],
                    contextWindow: 1048576,
                    // Reasoning tokens share this budget with visible output.
                    maxTokens: 32768,
                    // Muse models always reason; effort "none" returns HTTP 400.
                    // Map OpenClaw's "off" level to Meta's lightest accepted effort.
                    thinkingLevelMap: { off: "low" },
                  },
                ],
              },
            },
          },
        }
      : {}),
  };
}

export function childEnvironment(paths, env = process.env) {
  // Explicit overrides isolate config, auth, SQLite state, jobs and sessions from other gateways.
  const child = {
    ...env,
    OPENCLAW_STATE_DIR: paths.state,
    OPENCLAW_CONFIG_PATH: paths.config,
    OPENCLAW_PROFILE: "meta-hackathon",
  };
  // The CLI honors gateway URL/auth environment overrides before profile config.
  // Never send this profile's calls to an inherited original-gateway connection.
  for (const name of [
    "OPENCLAW_GATEWAY_URL",
    "OPENCLAW_GATEWAY_PORT",
    "OPENCLAW_GATEWAY_TOKEN",
    "OPENCLAW_GATEWAY_PASSWORD",
  ]) {
    delete child[name];
  }
  return child;
}

export function requireSponsorKey(env = process.env) {
  if (!env.MODEL_API_KEY?.trim()) {
    throw new Error(
      "MODEL_API_KEY is missing. Meta Model API inference is unavailable. Fill .env.meta and launch with node --env-file=.env.meta, or use --local for native Studio testing only.",
    );
  }
}

const agentInstructions = `# Creative Claw - Meta creator assistant

Help creators edit their own image, audio, video and vector files with the native creative tools.
Discover available operations with the creative tools before choosing one. Inspect parameter descriptors.
Only use operations whose engines are actually available. Never claim an edit succeeded without a completed tool result and saved output.
Preserve source files and existing exports. Honor user corrections. Report the saved path and limitations.
Stay within the requested media operation; no shell, browser, publishing, billing or unrelated automation.
A local native Studio run is not evidence of Meta inference. Meta usage must be proven by actual provider/model traces.
`;

export function setup({ paths, local, model, port }) {
  if (existsSync(paths.config)) {
    throw new Error(
      "This profile already has a config. Inspect/edit its canonical config rather than overwrite it.",
    );
  }
  const config = buildConfig({ paths, local, model, port, token: randomBytes(32).toString("hex") });
  mkdirSync(paths.workspace, { recursive: true });
  writeFileSync(paths.config, `${JSON.stringify(config, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  writeFileSync(path.join(paths.workspace, "AGENTS.md"), agentInstructions, { flag: "wx" });
  return config;
}

function launch(args, paths, capture) {
  const result = spawnSync(process.execPath, [path.join(repo, "openclaw.mjs"), ...args], {
    cwd: repo,
    env: childEnvironment(paths),
    stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) {
    throw new Error(
      "Could not launch Creative Claw. Check the Node installation and built application.",
    );
  }
  return result;
}

export function runCli(args, paths) {
  return launch(args, paths, false).status ?? 1;
}

/** Call one gateway method through the real CLI client and return its JSON result. */
export function gatewayCall(method, params, paths) {
  const result = launch(
    [
      "gateway",
      "call",
      method,
      "--params",
      JSON.stringify(params),
      "--json",
      "--timeout",
      "900000",
    ],
    paths,
    true,
  );
  const value = JSON.parse(result.stdout || "{}");
  if (result.status !== 0 || value?.ok === false) {
    throw new Error(`${method} failed: ${value?.error ?? `exit ${result.status}`}`);
  }
  return value;
}

/** Compact, credential-free trace of one revision for terminal evidence. */
export function summarizeRevision(revision) {
  return {
    revision: revision.index,
    kind: revision.kind,
    request: revision.request,
    status: revision.status,
    provider: revision.planner?.provider ?? null,
    model: revision.planner?.model ?? null,
    plannerAttempts: revision.planner?.attempts ?? 0,
    usage: revision.planner?.usage ?? null,
    plan:
      revision.plan?.steps.map((step) => ({
        capability: step.capability,
        parameters: step.parameters,
      })) ?? null,
    summary: revision.plan?.summary ?? null,
    output: revision.outputPath ?? null,
    nodes: revision.nodes ?? [],
    sourceUnchanged: revision.sourceUnchanged,
    ...(revision.error ? { error: revision.error } : {}),
  };
}

export function main(argv = process.argv.slice(2)) {
  const [command, ...options] = argv;
  const local = options.includes("--local");
  function value(flag, fallback) {
    const index = options.indexOf(flag);
    if (index === -1) {
      return fallback;
    }
    if (!options[index + 1] || options[index + 1].startsWith("--")) {
      throw new Error(`${flag} needs a value`);
    }
    return options[index + 1];
  }
  const paths = pathsFor(value("--state-dir", defaultState), local);
  if (command === "setup") {
    const config = setup({
      paths,
      local,
      model: value("--model", DEFAULT_MODEL),
      port: Number(value("--port", String(DEFAULT_PORT))),
    });
    console.log(
      JSON.stringify({
        mode: local ? "local-native-only" : "meta-sponsor",
        stateDir: paths.state,
        configPath: paths.config,
        port: config.gateway.port,
        credentialStored: false,
      }),
    );
    return 0;
  }
  if (!existsSync(paths.config)) {
    throw new Error(`Run setup${local ? " --local" : ""} first.`);
  }
  const config = JSON.parse(readFileSync(paths.config, "utf8"));
  const sponsor = config.models?.providers?.meta;
  if (command === "dashboard") {
    return runCli(["dashboard", ...(options.includes("--no-open") ? ["--no-open"] : [])], paths);
  }
  if (command === "check") {
    console.log(
      JSON.stringify({
        mode: local ? "local-native-only" : "meta-sponsor",
        endpoint: sponsor?.baseUrl ?? null,
        api: sponsor?.api ?? null,
        model: sponsor?.models?.[0]?.id ?? null,
        credentialAvailable: Boolean(process.env.MODEL_API_KEY?.trim()),
        inferenceVerified: false,
        port: config.gateway.port,
        configPath: paths.config,
      }),
    );
    return local || process.env.MODEL_API_KEY?.trim() ? 0 : 2;
  }
  if (command === "start") {
    if (local) {
      console.log(
        "LOCAL NATIVE STUDIO ONLY: no Meta provider configured; model planning is unavailable.",
      );
    } else {
      requireSponsorKey();
    }
    return runCli(["gateway", "--port", String(config.gateway.port)], paths);
  }
  if (local && (command === "smoke" || command === "revise")) {
    throw new Error(
      "Model-planned commands need the sponsor profile and MODEL_API_KEY; no synthetic inference success is generated.",
    );
  }
  if (sponsor?.baseUrl !== META_ENDPOINT || !sponsor.models?.[0]?.id?.startsWith("muse-")) {
    throw new Error(
      "Sponsor profile must target the documented Meta Model API endpoint and a Muse model.",
    );
  }
  if (command === "smoke") {
    requireSponsorKey();
    // Exercise the actual gateway agent runtime and its tool loop, not a parallel HTTP client.
    return runCli(
      [
        "agent",
        "--agent",
        "creative-meta",
        "--message",
        "Use the image.list_ops tool now to discover actual native image capabilities. Do not edit any file. Report engine availability from the tool result and do not invent operations.",
        "--json",
      ],
      paths,
    );
  }
  if (command === "revise") {
    // The gateway owns the key; this client only needs the profile's gateway token from config.
    const input = value("--input");
    const instruction = value("--instruction");
    if (!input || !instruction) {
      throw new Error('revise needs --input PATH and --instruction "TEXT"');
    }
    const started = gatewayCall(
      "creative.studio.revision.start",
      // The loopback gateway runs on this machine; resolve relative paths against this shell.
      { input: path.resolve(input), instruction },
      paths,
    );
    const trace = [summarizeRevision(started.revision)];
    const correction = value("--correction");
    if (correction) {
      const corrected = gatewayCall(
        "creative.studio.revision.correct",
        { id: started.session.id, feedback: correction },
        paths,
      );
      trace.push(summarizeRevision(corrected.revision));
    }
    const exportPath = value("--export");
    let exported = null;
    if (exportPath) {
      // Keep the revision trace as evidence even when there is no successful preview to export.
      try {
        exported = gatewayCall(
          "creative.studio.revision.export",
          { id: started.session.id, output: path.resolve(exportPath) },
          paths,
        ).export;
      } catch (error) {
        exported = { error: error.message };
      }
    }
    console.log(
      JSON.stringify(
        {
          session: started.session.id,
          source: started.session.sourcePath,
          sourceHash: started.session.sourceHash,
          revisions: trace,
          export: exported,
        },
        null,
        2,
      ),
    );
    return trace.every((entry) => entry.status === "succeeded") && !exported?.error ? 0 : 3;
  }
  throw new Error(
    "Usage: node scripts/meta-hackathon.mjs setup|check|start|dashboard|smoke|revise [--local] [--state-dir PATH] [--model MUSE_ID] [--port 18991] [--input PATH --instruction TEXT [--correction TEXT] [--export PATH]]",
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
