# Meta models, memory and VR

Research date: 2026-10-26. All integrations require real account/API testing before they are described as supported in this application.

## Models and components

| Component | Role in this app | Initial choice |
| --- | --- | --- |
| Muse Spark | Orchestrate existing tools and respond to user corrections | First provider smoke test; select a currently available model ID. |
| Muse Wonder | More involved planning/tool use | Compare only if simpler orchestration fails; avoid a second runtime. |
| SAM 3.1 | Prompt-based subject masks/boxes for selective edits | Optional after image/video payloads and engine mask contract are verified. |
| Muse Image | Generate or edit imagery | Optional; not needed to prove native editing. |
| Muse Voice Transcribe | Audio-to-text | Retain working local speech initially; compare only if useful. |
| Muse Glimmer | Local text/image perception and reasoning | Optional replacement candidate for local perception, subject to memory/hardware fit and measured quality. |
| Muse Code SDK | Control a terminal-agent session from another program | Defer unless a concrete missing runtime feature makes it cheaper than direct API integration. |

Official overview: https://dev.meta.ai/docs/overview
Muse Code / SDK: https://dev.meta.ai/docs/muse-code
Glimmer: https://dev.meta.ai/docs/muse-glimmer
Image API: https://dev.meta.ai/docs/image-generation

Glimmer's documented 30B dense text/image model and Apache 2.0 weights do not establish a fit on a particular consumer GPU. Quantization and benchmark evidence are required. No claim that Muse Code is an OpenClaw fork, or that its full UI source is available, is established.

## Memory decision

Keep Creative Claw's asset-oriented SQLite visual memory and canonical runtime stores. Keep user-approved preferences separate from inferred asset descriptions; link corrections to source media and outputs. Models do not supply durable app memory merely by offering a long context window.

Muse Code documents repo instruction files and scoped local memory with an index and on-demand retrieval:
https://dev.meta.ai/docs/muse-code/configuration
Borrow the useful product pattern—small preference index, scoped retrieval, explicit corrections—without transplanting a second storage system or copying unverified proprietary implementation.

Useful demo: save an export preference, restart, apply it to a new file, show where it was recalled. Skip the claim if persistence is not proven.

## VR decision

This is the Meta Global AI Developer event, not the separate Quest/VR competition. A headset is not required by the cited brief.

Defer a new VR frontend. Possible later interface: browse media on a spatial canvas, select subjects, preview edits and issue voice instructions while the existing backend executes. Device capability, transport, frame latency and native media format support all need separate verification. SAM supplies segmentation, not a complete VR application.

## Keep / change / defer

Keep C++ execution, engine tool contracts, local perception when useful, memory and GPU coordination. Change model routing and the smallest UI surfaces needed for a consumer editing job. Defer runtime replacement, all-engine demonstrations, training, new headset deployment and automatic social publishing.

## Model comparison evidence

Use identical sample tasks across providers. Capture valid tool execution, correction success, output quality, latency and usage. Render actual results; do not use an API success status as proof that the edit is correct. Exact supported image/mask/video formats must be verified from the current API and engine contracts.
