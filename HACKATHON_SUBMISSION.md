# Meta submission draft — November 4, 2026

Prepared for participant review. Not submitted. The demo link and participant
opinion questions must be completed before the final submission.

## Project / team name

Creative Claw — Local Meta Studio

## Suggested track and problem statement

Startups Track — an event-created extension to an existing creative product.
Build for Your World — reduce repetitive media-editing work for creators.

## Public GitHub repository

https://github.com/bkennedyshit/creative-claw-meta-2026

## Three-minute demo video

Pending the final accessible video URL. The first OBS recording supplied was
5:16.87 and had a silent AAC track; it has not been submitted as the final demo.

## Project description

Creative Claw — Local Meta Studio turns a creator's plain-language request into
an executable media-editing plan. A local Meta Muse Glimmer model chooses from
the application's available native operations. The creator can inspect the
plan, preview the actual result, request a correction, and export a separate
file while preserving the original.

The new hackathon workflow validates operation names, compatible input/output
types and parameter bounds before execution. A correction produces a complete
replacement plan applied to the original media, avoiding accumulated edits.
Exports refuse to overwrite existing files and verify the copied bytes. The
interface records the actual planner/provider and saved result, and reports
failed or unsupported requests.

The event work comprises the Meta provider setup, model-planned revision
sessions, describe/preview/correct/export interface, editing-first navigation,
and browser GPU release/return controls. The existing OpenClaw runtime and
Creative Claw Studio, C++ media engines, jobs and memory are disclosed inherited
components, not claimed as new hackathon work.

Verified examples include a photo converted to black and white and corrected
to sepia, and a video trimmed to a six-second cut and corrected to four seconds.
Local Muse Glimmer inference was verified on an RTX 3090. The workflow currently
uses text instructions, file metadata and an operation catalog; it does not
analyze source pixels to autonomously select moments.

## Describe your use of Meta products

The application uses Meta's open-weight Muse Glimmer model locally through
Ollama's native API. The exact tested model is muse-glimmer:30b, Q4_K_M, with a
16,384-token runtime context on an RTX 3090. The model plans operations over the
real catalog of available native media tools and replans from user corrections.
Plans are checked and executed by Creative Claw's native engines. Execution
records identify provider ollama and model muse-glimmer:30b, along with token
usage, selected operations, output paths and source-preservation checks.

The separately prepared hosted Muse Spark / Meta Model API profile was not used
for the verified local runs. No hosted Meta API usage, Muse Code usage, or
Fireworks/Modal/Baseten integration is claimed.

## Why are Meta's models important?

Muse Glimmer supplies the language-to-operation planning and revision reasoning
that connects a creator's intent to real editing tools. The same model handles
the initial request and subsequent correction, while the application validates
and executes the plan. Running the open-weight model locally allows this
workflow to function without hosted inference credentials and keeps its model
requests on the local machine. The model is central to choosing and revising
the edit, rather than being used only for a chat description of the result.

## Partner technology feedback

We used local Ollama inference; Fireworks, Modal and Baseten were not used.

## Participant responses still required

- Likelihood of building with Meta Model API: participant's choice.
- Overall opinion of Meta Model API: participant's choice; local-model testing
  is not evidence of hosted API experience.
- Optional survey questions: participant's choice.
- Promotion / submitted-materials permission: participant must review.

## Validation and reproduction

See [local model setup](HACKATHON_LOCAL_MODEL.md), [new-work disclosure](HACKATHON_NEW_WORK.md),
and [native prerequisites](extensions/creative-engines/binaries/README.md).
The compiled native libraries and ONNX weights are not in Git. Another machine
must provision those prerequisites; clean-machine reproduction has not been
verified. Do not describe the repository as a self-contained binary distribution.
