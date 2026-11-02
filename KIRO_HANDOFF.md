# Meta hackathon implementation handoff — November 2, 2026

## Objective

Prepare this Creative Claw copy for the Meta Global AI Developer Hackathon by November 4 at 9 p.m. America/New_York. Build and demonstrate one new Meta-powered edit → preview → correction → export workflow. This is implementation work, not just source transfer.

## Current verified state

- Repository: https://github.com/bkennedyshit/creative-claw-meta-2026
- Application baseline: original Creative Claw main `64536967c0e5729cce527730d44279279a0db208`. Main still matched that revision on November 2.
- Destination main before this handoff: `48acc550af342af9be60f1ef2b74f8664ccc6d0e`.
- Source, Studio fixes, plans and rules are present. No Meta provider integration or new editing workflow has been implemented here.
- This checkout has no installed node_modules, built UI or provisioned native engine binaries as of the November 2 check.
- No Meta credential was available in the checked process/Windows user environment. `.env.meta` is a local Git-excluded file with `MODEL_API_KEY=` ready for the user to fill. Do not read/print secrets or commit that file. Use an explicit env-file launcher if chosen; don't assume automatic loading.
- The NVIDIA copy successfully exercised real hosted model tool calls and image inversion. Its setup script and HACKATHON_TESTING.md are useful references; its authentication, port and state must remain isolated from this app.

## Read first

AGENTS.md and applicable scoped instructions; HACKATHON_RULES.md, HACKATHON_PLAN.md, HACKATHON_MODELS.md and HACKATHON_EXECUTION.md. Preserve README/planning documents, licenses and attribution. Record inherited work separately from event-created features.

## Work to complete

1. Inspect current provider/UI seams, install pinned dependencies and provision native assets locally. Use existing runtime/provider support. The sibling `../creative-claw-nebius-2026` has a known-good local asset set; assets are ignored prerequisites, not distributable Git source.
2. Integrate Meta Model API through the existing provider system, with a separate gateway port/state/workspace/memory store. Official API quickstart: https://dev.meta.ai/docs/quickstart. Inspect current API contracts/model availability; don't assume Nebius model settings apply. A real Meta model/tool run needs the user's credential and usable billing/credits. Coding can proceed while credentials are pending.
3. Implement a focused creator workflow that preserves input media, executes real native editing tools, exposes a preview and accepts a meaningful correction before final export. Reuse Studio rather than replacing the frontend/runtime. Keep saved paths, run state and failures visible. Avoid a superficial provider/logo swap as the entire entry.
4. Reuse the original violet/mint icon from the NVIDIA copy; preserve its branding/provenance. Focus navigation on editing; don't delete core runtime capabilities or disguise upstream authorship.
5. Prove a model-selected operation and real saved output, correction/export, original preservation, invalid input and unavailable-tool behavior. Run scoped checks and mandatory repo review. Don't claim API or UI validation from unit tests alone.
6. Prepare reproducible setup/native asset instructions, new-work disclosure, public source and a three-minute demo. User must review before any submission or public social post. No hosted-demo URL field appeared in the participant submission form; keep the demonstrated local application runnable.

## Boundaries

Leave original Creative Claw and other hackathon projects unchanged. No force push, inherited Actions workflows, deployment, submission, billing changes or public messages. Don't clone Meta's proprietary app/UI. Muse Code is an optional development tool, not a mandatory application frontend. Open-source reuse is permitted under the verified rules when licenses are followed and the submission enhances it; demo only the new event work and disclose its foundation.

## Success evidence to return

New commit(s), app launch instructions/port, exact Meta model and actual tool trace without credentials, saved input/output comparison, correction result, validation summary, and remaining submission items. If key/credits are absent, clearly separate local completed work from unverified sponsor inference.
