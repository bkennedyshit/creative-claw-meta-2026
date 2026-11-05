# Meta testing and isolated launch

For the local open-weight Meta model route without an API key, use
[Local Muse Glimmer](HACKATHON_LOCAL_MODEL.md). The commands below describe the
separate hosted API and native-only profiles.

This copy keeps the existing Creative Studio frontend and native media engines. It adds an isolated launcher for the Meta Model API and a model-planned revision workflow. See [new work](HACKATHON_NEW_WORK.md) for what was built during the event.

## Prerequisites

- Node 22.19 or newer (`package.json` engines field). Node 22.20 was used for the checks below.
- pnpm 11.2.2 through Corepack. Run commands as `corepack pnpm ...`.
- FFmpeg and FFprobe on `PATH`. Audio and video operations need them.
- Install and build from the repository root:

  ```powershell
  corepack pnpm install --frozen-lockfile
  corepack pnpm build
  ```

## Native assets

The native engine libraries and ONNX model weights are Git-ignored local prerequisites. They are not distributed in this repository. Without them every engine reports `available: false`, and the revision workflow reports that no engine is available for the source type. See `extensions/creative-engines/binaries/README.md` for what each file is and where it goes.

Files present locally on November 2, 2026, under `extensions/creative-engines/binaries/`:

- `libomni_audio_bridge.dll`, `libomni_image_bridge.dll`, `libomni_vector_bridge.dll`, `libomni_video_bridge.dll`
- `onnxruntime.dll`, `onnxruntime_providers_shared.dll`, `onnxruntime_providers_cuda.dll`
- `vfx/omni_video_bridge.dll`
- `models/colorization.onnx`, `models/depth_anything_v2_small.onnx`, `models/depth_anything_v2_small.onnx_data`, `models/face_parsing.onnx`, `models/fbcnn.onnx`, `models/model.onnx_data`, `models/u2net.onnx`

These are Windows builds. They were provisioned from a local sibling copy of Creative Claw, not downloaded from this repository. Another machine needs its own copies.

## Meta key

1. Sign in to the Model API dashboard at https://dev.meta.ai/ and create a key under **API keys**.
2. Put it in the Git-excluded `.env.meta` file at the repository root as `MODEL_API_KEY=...`.
3. Launch with Node's explicit env-file option, for example `node --env-file=.env.meta scripts/meta-hackathon.mjs start`. The launcher does not load the file by itself.

Never commit `.env.meta`, paste the key into chat, or show it in a recording. The generated profile config stores only an environment reference (`MODEL_API_KEY`), never the key value.

## Commands

All commands run from the repository root. Add `--local` to use the local profile, which has no Meta provider and is for native Studio testing only.

| Command                                                                      | What it does                                                                                                                                               |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `setup [--local] [--model MUSE_ID] [--port PORT]`                            | Creates the profile config, agent workspace and token. Refuses to overwrite an existing profile.                                                           |
| `check [--local]`                                                            | Prints endpoint, model, port and whether `MODEL_API_KEY` is set. Always reports `inferenceVerified: false`. Exits 2 for the sponsor profile without a key. |
| `start [--local]`                                                            | Starts the gateway. The sponsor profile refuses to start without a key.                                                                                    |
| `dashboard [--local] [--no-open]`                                            | Opens this profile's authenticated dashboard.                                                                                                              |
| `smoke`                                                                      | Sponsor only. Asks the real gateway agent to call the `image.list_ops` tool. Edits no files.                                                               |
| `revise --input PATH --instruction TEXT [--correction TEXT] [--export PATH]` | Sponsor only. Runs a revision session through the running gateway and prints a trace.                                                                      |

Local native testing:

```powershell
node scripts/meta-hackathon.mjs setup --local
node scripts/meta-hackathon.mjs check --local
node scripts/meta-hackathon.mjs start --local
# Second terminal:
node scripts/meta-hackathon.mjs dashboard --local
```

Meta inference:

```powershell
node --env-file=.env.meta scripts/meta-hackathon.mjs setup
node --env-file=.env.meta scripts/meta-hackathon.mjs check
node --env-file=.env.meta scripts/meta-hackathon.mjs start
# Second terminal:
node --env-file=.env.meta scripts/meta-hackathon.mjs dashboard
node --env-file=.env.meta scripts/meta-hackathon.mjs smoke
node --env-file=.env.meta scripts/meta-hackathon.mjs revise --input C:\media\photo.jpg --instruction "Make it warmer" --correction "Less saturated" --export C:\media\photo-warm.png
```

Both profiles use port 18991 by default. The launcher rejects 18789 (original gateway) and 18990 (Nebius copy). Stop one profile before starting the other on the same port. State lives in `~/.creativeclaw-meta-2026/local` and `~/.creativeclaw-meta-2026/sponsor`, each with its own config, workspace, sessions and `visual-memory` store. The launcher sets `OPENCLAW_STATE_DIR` and `OPENCLAW_CONFIG_PATH` for each child process and removes inherited `OPENCLAW_GATEWAY_*` overrides.

`revise` calls `creative.studio.revision.start`, then `.correct` and `.export` when those flags are given. It prints a credential-free JSON trace: session id, source path and hash, and for each revision the status, `provider`, `model`, planner attempts, token usage, the validated `plan`, `output` path, per-node results, `sourceUnchanged` and any error. It exits 3 if any revision failed or the export failed. Relative `--input` and `--export` paths are resolved against the current directory before they are sent to the gateway. The export path must be a new file with the same extension as the revision output.

If the export cannot run (for example, no revision succeeded), the trace is still printed and its `export` field holds the error.

## Meta Model API settings

Taken from https://dev.meta.ai/docs as given in the event brief on November 2, 2026. Re-check them against the live docs before relying on them:

- Base URL: `https://api.meta.ai/v1`.
- Default model: `muse-spark-1.3`, with a 1,048,576-token context window.
- Meta recommends the Responses API for tool loops, so the profile uses the `openai-responses` transport.
- Muse models always reason. Reasoning effort `none` is rejected with HTTP 400, so the profile maps OpenClaw's `off` level to `low`.

The profile requests up to 32,768 output tokens per call, and revision planning requests 16,000. Reasoning tokens count against these budgets.

## Device pairing

If `gateway call` (used by `revise`) reports `scope upgrade pending approval`, the CLI device was first paired with fewer scopes than the call needs. Approve that exact request with the same profile environment:

```powershell
$env:OPENCLAW_STATE_DIR = "$HOME\.creativeclaw-meta-2026\sponsor"
$env:OPENCLAW_CONFIG_PATH = "$HOME\.creativeclaw-meta-2026\sponsor\creativeclaw.json"
node openclaw.mjs devices list
node openclaw.mjs devices approve <requestId>
```

This was observed during testing and is not yet resolved.

## Verification status

Verified locally:

- Launcher tests: 5 passed (`test/scripts/meta-hackathon.test.ts`).
- Revision tests: 3 passed (`extensions/creative-engines/src/studio-revisions.test.ts`). They use the real native image engine with a scripted planner in place of the model. They cover a planned edit, a correction applied to the original, export, the one re-ask, rejected plans, declined requests, planner outages, an unavailable engine and bad input.
- Existing Studio native tests: `studio.test.ts` (6 passed, 3 skipped) and `studio-recipes.test.ts` (36 passed).
- Control UI tests for the revision panel, Studio, jobs, workflow and navigation.

Not yet verified:

- Live Meta inference. No key was available yet, so `smoke` and `revise` have not run against the Meta Model API.
- Hosted Muse Spark browser behavior. A local Muse Glimmer browser edit,
  correction, preview and export were verified November 4; see the local guide.
- A full `corepack pnpm build` after the event-period changes.
- Reproduction on another machine.

Run the scoped tests with:

```powershell
corepack pnpm test test/scripts/meta-hackathon.test.ts extensions/creative-engines/src/studio-revisions.test.ts
```

Unit tests and config checks are not evidence of Meta inference. Keep the `revise` trace from a real run as that evidence.
