# Local Meta Muse Glimmer

This is the no-API-key route for the Meta hackathon application. It uses Meta's
open-weight Muse Glimmer 30B through the existing native Ollama provider and the
same event-created revision workflow. No hosted Meta API call is required.

Sources checked November 4, 2026:

- [Meta model documentation](https://dev.meta.ai/docs/muse-glimmer): 30B dense,
  text/image input, Apache 2.0 weights.
- [Ollama distribution](https://ollama.com/library/muse-glimmer): `muse-glimmer:30b`,
  approximately 18 GB download. Preserve the model's license and attribution.
- [Event guide](https://cerebralvalley.ai/e/meta-ai-developer-hackathon/details):
  eligible Meta open-weight models may run on participants' own hardware.

## Requirements

Use the application prerequisites and native assets in
[HACKATHON_TESTING.md](HACKATHON_TESTING.md). Ollama must be installed and running.
The tested machine has an RTX 3090 with 24 GB VRAM. This profile limits context to
16,384 tokens; the model's advertised maximum context is not a GPU-fit guarantee.

## Download and configure

Run PowerShell from this repository root. This creates a new isolated profile,
refuses to overwrite its existing config, and generates a fresh gateway token.
It does not copy credentials from another app.

```powershell
ollama pull muse-glimmer:30b

@'
import { buildConfig } from './scripts/meta-hackathon.mjs';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
const state = path.join(os.homedir(), '.creativeclaw-meta-2026', 'glimmer');
const paths = {
  state,
  config: path.join(state, 'creativeclaw.json'),
  workspace: path.join(state, 'workspace'),
};
if (existsSync(paths.config)) throw new Error('Profile exists; inspect instead of overwriting');
const config = buildConfig({ paths, local: true, port: 18991, token: randomBytes(32).toString('hex') });
config.agents.defaults.model = { primary: 'ollama/muse-glimmer:30b' };
config.agents.defaults.thinkingDefault = 'off';
config.agents.list[0].name = 'Creative Claw — Local Meta Glimmer';
config.plugins.entries['creative-engines'].config.mediaUnderstanding = {
  visionModel: 'ollama/muse-glimmer:30b', visionProvider: 'ollama',
};
config.plugins.allow.push('ollama');
config.plugins.entries.ollama = { enabled: true };
config.models = { providers: { ollama: {
  baseUrl: 'http://127.0.0.1:11434', api: 'ollama', apiKey: 'ollama-local',
  models: [{
    id: 'muse-glimmer:30b', name: 'Meta Muse Glimmer 30B — local',
    reasoning: true, input: ['text', 'image'], contextWindow: 16384, maxTokens: 4096,
    params: { num_ctx: 16384, keep_alive: '15m', think: false },
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  }],
} } };
mkdirSync(paths.workspace, { recursive: true });
writeFileSync(paths.config, JSON.stringify(config, null, 2) + '\n', { flag: 'wx' });
writeFileSync(path.join(paths.workspace, 'AGENTS.md'),
  'Plan creator media edits with the configured local Meta model. Use available native tools. Preserve originals and report actual saved outputs. No publishing or billing actions.\n',
  { flag: 'wx' });
console.log('Created isolated local Meta profile');
'@ | node --input-type=module
```

`ollama-local` is a non-secret loopback marker, not an API credential. The Ollama
URL intentionally has no `/v1`: this app's provider uses native `/api/chat`.

## Run

Stop any other Meta gateway on port 18991 first. The original and Nebius apps use
different profiles/ports and should remain untouched.

```powershell
$env:OPENCLAW_STATE_DIR = "$env:USERPROFILE/.creativeclaw-meta-2026/glimmer"
$env:OPENCLAW_CONFIG_PATH = "$env:OPENCLAW_STATE_DIR/creativeclaw.json"
node openclaw.mjs gateway --port 18991
```

In another terminal, set the same two environment variables and run:

```powershell
node openclaw.mjs dashboard
```

This opens the authenticated Studio at `http://127.0.0.1:18991/creative`. Keep the
gateway token private. Use the native CLI here: `meta-hackathon.mjs --local` still
means the older native-only test profile, not this Glimmer profile.

Enter a source file's absolute path under **Describe an edit**, request an edit,
review the preview and the reported provider/model, apply a correction, and export
to a new path. Plans still receive text metadata and the available operation
catalog, not source pixels. The model's vision capability is not used by this
revision workflow.

## Verification

Verified November 4 through the actual browser panel and native engines:

- Ollama 0.40.13, `muse-glimmer:30b`, Q4_K_M. Model metadata reports 27.9B
  language-model parameters plus a separate 1.9B vision projector. The local
  manifest SHA-256 is `47047bcde318d0d3b14b647bf85df60529b75195cf1400c43b892955fe6d3d47`.
- `ollama ps` reported 100% GPU execution at context 16,384. Total GPU memory
  use observed around 21 GB, including other desktop use; this is one machine's
  measurement, not a general hardware guarantee.
- Session `revision-ea8ad0e6-b25d-498b-a6e9-962c467f8034`: "Make this image
  black and white" selected `image.desaturate`, one planning attempt, succeeded.
- Correction "Instead of black and white, make it sepia for a vintage look.
  Keep the original size" selected `image.sepia`, one attempt, succeeded.
- The two traces report provider `ollama`, model `muse-glimmer:30b`, respectively
  9,670/155 and 9,760/168 input/output tokens. Native operations took 36/38 ms;
  those numbers exclude model loading and inference latency. The cold first
  Ollama request took approximately 70 seconds.
- Pixel checks: first output is grayscale, corrected output has color, all
  images remain 960 × 640. The original SHA-256 is unchanged. Export bytes match
  the corrected revision exactly.
- UI build passed after replacing the hardcoded Muse Spark label. The eight
  scoped launcher/revision tests passed earlier on November 4.

Private local evidence is under `.artifacts/glimmer/`: `model-metadata.json`,
`revisions.json`, `verification.json`, `browser-result.txt`, `studio-proof.png`
and `export-sepia.png`. The input was a synthetic geometric test image, not a
real-world quality benchmark. The model files and private profile config are
local prerequisites, not committed assets. The three-minute submission video
has not been recorded by this setup task.

The CLI requested an additional device scope upgrade while retrieving traces.
No extra scope was granted: the browser workflow completed normally, and its
persisted revision records were read from the local application database for
verification. This does not block using the browser panel.

## GPU controls for the demo

The GPU Broker card is above the editor, not inside Advanced tools.
**Last edit planner** identifies the model that planned the selected revision.
**Resident Ollama models** lists actual models loaded by any local app sharing
this Ollama server; this list can include models unrelated to this project.

After completing an edit/export, click **Release VRAM** to unload resident Ollama
models and take a Studio-owned lease. Click **Return GPU to app** before another
edit. Return ends the lease; the configured model loads on the next edit.
**Refresh GPU** reads current residency and VRAM. No model names are substituted
to make the display appear Meta-only.

Initial automated-review attempts were blocked by the configured model's account
availability. The reviewer was rerun with the available `gpt-6.1-sol` model. Its
accepted timeout findings were corrected, regression tests were added, and the
final structured review reported no accepted/actionable findings.

Live GPU-control verification on November 4: unloading resident Qwen models
reduced device VRAM to approximately 2.6 GB. The revised confirmation waits for
Ollama's asynchronous residency update. Release and Return succeeded through the
actual browser buttons. A subsequent Muse Glimmer-planned video cut succeeded;
the refreshed card and `ollama ps` both showed `muse-glimmer:30b` resident on the
GPU, approximately 20.3 GB total device VRAM. The final grouped test run passed
50 tests. Runtime and UI builds and the focused plugin lint passed. Local
recording evidence is in `D:/AGENT/output/meta-demo/gpu-muse-controls.png`.
The local-model setup, controls and validation documentation are included in the November 4 source update.
