# Three-minute demo script

Review this script, the recording and all submission text yourself before submitting or posting anything publicly.

## Script

**0:00-0:20 Intro and disclosure.** Creative Claw lets creators edit their own photos, audio and video by describing the change. State on screen that OpenClaw and Creative Claw, including the native engines and Studio, are the existing open-source foundation. The new work is the Meta-planned revision workflow (see [HACKATHON_NEW_WORK.md](HACKATHON_NEW_WORK.md)).

**0:20-1:30 Describe an edit.** Open Creative Studio on the local Muse Glimmer profile described in HACKATHON_LOCAL_MODEL.md. Choose an ordinary photo and type a request such as "make it warmer and a little brighter". Rehearse the exact wording first; the model can only use operations in the live catalog. Show the revision in the panel: "planned by" with the provider and `muse-glimmer:30b`, and the plan steps with their parameters. Per-node results are retained in the persisted revision execution records. Show the rendered preview next to the original.

**1:30-2:15 Correction.** Enter feedback such as "too orange, keep it closer to natural". Point out that the new plan is complete and runs on the original file, not on the previous preview. Compare the two previews.

**2:15-2:45 Export.** Export the chosen revision to a new file path. Show the new file in the file browser and that the revision reports the source as unchanged (`sourceUnchanged: true`). Optionally show that exporting to the same path again is refused.

**2:45-3:00 Failure case.** Request something the catalog cannot do, for example "add background music" to a photo. Show the declined or rejected plan with its reason and that no output was produced.

## Before recording

- [ ] `ollama list` includes `muse-glimmer:30b`; no Meta API key is required for this route.
- [ ] The isolated Glimmer gateway is running on port 18991; follow HACKATHON_LOCAL_MODEL.md.
- [ ] All media is your own or licensed for this use.
- [ ] No key, token or private path is visible on screen.
- [ ] Rehearse the exact edit, correction and export; retain its execution trace as backup evidence of the actual planner and output.
- [ ] Record and play a short microphone test before recording the full demo. An audio stream can exist while containing silence.
- [ ] The final video is under three minutes.
