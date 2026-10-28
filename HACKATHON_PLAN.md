# Creative Claw — Meta Muse 2026

Prepared 2026-10-26; refreshed from current upstream 2026-10-28. Status: planning copy of the existing application. Meta provider integration, sponsor-specific UI changes and new demo are not yet implemented.

## Product and provenance

A general-purpose creative agent: import photos/audio/video, describe the desired edit, review it, request a correction and export. The application should make its existing native execution system usable to creators across domains.

Source: https://github.com/bkennedyshit/creative-claw
Baseline: 64536967c0e5729cce527730d44279279a0db208.
Creative Claw inherits OpenClaw and adds native C++ media plugins, local perception, GPU coordination and SQLite visual memory. Preserve all provenance and notices. Separate this foundation from work completed during the Meta event.

## Timing

Event: https://cerebralvalley.ai/e/meta-ai-developer-hackathon
Submission: Nov 4, 2026, 21:00 America/New_York.
User intends main implementation after Nov 1 credit reset; prepare source/fixtures/research first. This is a scheduling preference, not a verified balance or an automatic credit reset action.
The organizer email offers $150 in Model API credits, individually claimed and distributed in batches; it says a card is required. Check applied balance before spending. No credit form or billing action has been submitted in this preparation.

## Least-work direction

Use Meta Model API as an inference provider in Creative Claw. Reuse current media engines, memory, provider seams and the current Creative Studio UI in ui/. Improve the import, preview, correction and export surfaces; a new UI framework is unnecessary.

Muse Code is a separate terminal coding agent. Its SDK/session protocol is an integration option, not a verified drop-in web frontend. Prefer direct model calls initially, so the editing runtime stays the one already built.

Start with one complete photo or video editing workflow. Add SAM only if subject masks improve that workflow and API support is verified. Generated imagery is optional; manipulating users' existing files is the main use case.

## Submission evidence

The supplied kickoff screenshot requires Cerebral Valley submission listing every teammate, a three-minute demo video, and a public GitHub repository. Show what was built during the event. Record the baseline and new commits explicitly. Recheck the live details/waiver before submission.

## Ownership and scope

Official waiver: https://cerebralvalley.ai/e/meta-ai-developer-hackathon/waiver
The entrant retains ownership, but the terms grant broad perpetual reuse rights over submissions and shared materials and provide no confidentiality. A smaller entry does not revoke previously granted MIT rights or guarantee other shared materials are excluded. Keep the entry focused and avoid unrelated private code, assets and credentials.

## Read next

HACKATHON_MODELS.md covers Muse, memory and VR choices.
HACKATHON_EXECUTION.md defines the Nov 1-4 execution sequence and evidence.

## Current upstream refresh

The October 28 source transfer uses upstream 64536967c0e5729cce527730d44279279a0db208, which includes the Creative Studio, editable graphs/recipes, native foreground effects and durable job UI source added since the earlier August baseline. Read extensions/creative-engines/README.md before designing more UI. Reuse these existing surfaces; confirm runtime behavior on a provisioned machine. Source inspection is not a fresh native-engine test.

Visual-memory search currently uses a hash embedder described as lexical/byte similarity; do not market it as semantic vision retrieval. The new provider integration must be evaluated separately.

## Studio refresh from merged PR #6

Refreshed October 28, 2026 from upstream `64536967c0e5729cce527730d44279279a0db208`. This includes media-scoped workspaces, draft/path preservation, recoverable workflow archive/restore, a resizable canvas and historical output previews. These are inherited Creative Claw fixes, not new Meta-event work. Retain Creative Studio; no external frontend is needed. Meta-specific implementation remains deferred until November 1. Public event overview alone does not establish existing-project eligibility: obtain accepted-participant Official Rules before claiming this entry qualifies.
