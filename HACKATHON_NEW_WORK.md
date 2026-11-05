# New work for the Meta Global AI Developer Hackathon

This file separates work done during the event from the foundation it builds on.

## Foundation (inherited)

- [OpenClaw](https://github.com/openclaw/openclaw) (MIT): gateway, plugin system, agent runtime, provider transports and Control UI.
- [Creative Claw](https://github.com/bkennedyshit/creative-claw), baseline `64536967c0e5729cce527730d44279279a0db208`: native C++ image, audio, video and vector engines, Creative Studio, editable workflows and recipes, durable jobs and SQLite visual memory.

All of this existed before the event. Commits in this repository up to and including `b88c6eed` are preparation and source transfer only. They add no event features.

## Event-period work (November 2-4, 2026)

- Meta Model API provider profile and isolated launcher: `scripts/meta-hackathon.mjs`, tested by `test/scripts/meta-hackathon.test.ts`.
- Model-planned revision sessions: `extensions/creative-engines/src/studio-revisions.ts` and its test, exposed as the `creative.studio.revision.*` gateway methods.
- A shared linear graph builder (`buildLinearStudioGraph`) refactored out of the recipe code in `extensions/creative-engines/src/studio-recipes.ts`, used by both recipes and revisions.
- The Studio **Describe an edit** panel: `ui/src/ui/controllers/creative-revision.ts` and `ui/src/ui/views/creative-revision.ts`.
- Visible Studio GPU Broker controls: write-scoped release/return actions over the inherited broker, verified unloading, lease ownership checks, and separate labels for the edit planner and shared resident models.
- Editing-first navigation: the Creative group is first in the Control UI sidebar.
- The violet/mint icon set, reused unchanged from the Creative Claw Nebius event copy (see `ui/public/BRANDING.md`).

## How it works

The creator picks a file and describes an edit in plain language. The configured Meta model receives the request, basic file metadata and the live catalog of native operations whose engines loaded on this gateway, and replies with a JSON plan. Before any media is touched, Creative Claw checks that every step names an available operation, that each step accepts the previous step's output type, and that every parameter is within its declared bounds. A malformed or invalid plan gets one re-ask with the rejection reason; a plan the model declines is reported without a re-ask. The native engines then run the validated plan on the untouched original, and Studio shows the result as a preview. A correction sends the previous plan and the creator's feedback back to the model, which returns a complete new plan that again runs on the original, not on the previous preview. Export copies a chosen preview to a new file, refuses to overwrite anything and verifies the copied bytes. After every run the source file is re-hashed, and each revision records whether it is unchanged.

## Known limitations

- The model sees text metadata only (file name, type, dimensions or duration), not pixels.
- Plans are single-file linear chains of up to 6 steps.
- Visual memory search is hash and lexical similarity, not semantic vision retrieval.
