# Approved one-time source transfer

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

APPROVED by the user on October 27, 2026. The previous automatic review rejection is resolved by that explicit authorization of the temporary write-capable transfer job.

The workflow is manually dispatched and removes itself on success. No transfer has run yet. The browser connection is currently unavailable, so execution is pending. Run the **Approved one-time source transfer** workflow from the repository's Actions page on main once. The fixed source and destination above cannot be changed through inputs.

After completion, verify HACKATHON_SOURCE.md, preserved planning documents, application files and the absence of .github/workflows. Original repositories remain unchanged.
