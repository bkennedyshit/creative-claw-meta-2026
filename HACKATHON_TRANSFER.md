# Source transfer pending approval

The repository currently contains preparation documents only. The corresponding local source copy is ready; its application files have not yet been transferred to this GitHub repository.

## Fixed sources and destinations

| Destination | Source | Pinned commit |
| --- | --- | --- |
| bkennedyshit/opencv-ai-video-editor-2026 | bkennedyshit/bmx-clip-extractor | 22e5bf18cddf0418cb160c3bad1aa5a369c92c8f |
| bkennedyshit/creative-claw-nebius-2026 | bkennedyshit/creative-claw | e68a13ca24f5de82334949861a5fe4bedc3e4316 |
| bkennedyshit/creative-claw-meta-2026 | bkennedyshit/creative-claw | e68a13ca24f5de82334949861a5fe4bedc3e4316 |

AGENTO is a complete documentation/preparation repository and needs no source copy.

## Proposed bounded transfer

A manually dispatched GitHub Actions job in each of these three new repositories would:

1. Receive the standard temporary GITHUB_TOKEN with contents-write permission for that destination only.
2. Check the destination branch head against the freshly verified preparation revision; stop if it has changed.
3. Read the public source at the pinned commit above.
4. Preserve the preparation README and HACKATHON_*.md files.
5. Commit the source snapshot into that destination. Omit inherited CI workflows and remove the temporary transfer workflow itself.
6. Push normally, without force, and end. No scheduled or push-triggered automation would remain.

No credentials or secrets would be copied to another service, and original source repositories would not be changed. The token would have temporary repository write authority while the job runs. This is a source snapshot copy, not a migration of full commit history.

## Approval status

NOT APPROVED / NOT INSTALLED. Automatic approval review rejected both a persistent copy workflow and the proposed self-removing version because repository preparation did not explicitly authorize that write-capable automation. No transfer workflow was written or run.

The user's specific approval is needed before attempting that job. An alternative is an authenticated direct git push; no shell GitHub credentials are available in this workspace. Preparation documents are already committed here.
