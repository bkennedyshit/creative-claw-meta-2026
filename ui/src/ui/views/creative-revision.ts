import { html, nothing } from "lit";
import { plannerLabel, type CreativeRevision } from "../controllers/creative-revision.ts";
import type { CreativeStudioController } from "../controllers/creative-studio.ts";

const valueOf = (event: Event) => (event.target as HTMLInputElement | HTMLTextAreaElement).value;

function renderRevision(studio: CreativeStudioController, revision: CreativeRevision) {
  const busy = studio.revisions.busy;
  const planner = plannerLabel(revision);
  return html`<li class="creative-revision__item">
    <strong
      >#${revision.index} · ${revision.kind === "edit" ? "Edit" : "Correction"} ·
      ${revision.status}</strong
    >
    <p>${revision.request}</p>
    ${planner ? html`<p class="muted">${planner}</p>` : nothing}
    ${revision.plan
      ? html`<p>${revision.plan.summary}</p>
          <div class="creative-revision__steps">
            ${revision.plan.steps.map(
              (step) =>
                html`<span class="chip" title=${step.reason ?? ""}
                  >${step.capability} ${JSON.stringify(step.parameters)}</span
                >`,
            )}
          </div>`
      : nothing}
    ${revision.outputPath
      ? html`<p class="creative-output-path">Saved at: ${revision.outputPath}</p>`
      : nothing}
    ${revision.sourceUnchanged
      ? html`<span class="chip">Original unchanged</span>`
      : html`<p class="callout warn">
          The original no longer matches its starting hash or could not be re-read. Check the source
          file.
        </p>`}
    ${revision.error ? html`<p class="callout warn">${revision.error}</p>` : nothing}
    ${revision.rejectedReply
      ? html`<details>
          <summary>Rejected model reply</summary>
          <pre>${revision.rejectedReply}</pre>
        </details>`
      : nothing}
    ${revision.status === "succeeded" && revision.artifactId
      ? html`<button
          class="btn"
          ?disabled=${busy}
          @click=${() => void studio.revisions.previewRevision(revision)}
        >
          Preview revision ${revision.index}
        </button>`
      : nothing}
  </li>`;
}

export function renderCreativeRevision(studio: CreativeStudioController) {
  const revisions = studio.revisions;
  const { session, form, busy, message } = revisions;
  const exportable = session?.revisions.some((entry) => entry.status === "succeeded") ?? false;
  return html`<section class="card creative-revision" aria-label="Describe an edit">
    <div class="card-title">Describe an edit</div>
    <p class="muted">
      Each plan is applied to the untouched original. The model chooses operations; native engines
      execute them.
    </p>
    ${revisions.sessions.length > 1
      ? html`<label class="field">
          <span>Recent edits</span>
          <select ?disabled=${busy} @change=${(event: Event) => revisions.select(valueOf(event))}>
            ${revisions.sessions.map(
              (entry) =>
                html`<option value=${entry.id} ?selected=${entry.id === session?.id}>
                  ${entry.instruction.slice(0, 80)}
                </option>`,
            )}
          </select>
        </label>`
      : nothing}
    <div class="creative-revision__form">
      <label class="field">
        <span>Source file (absolute path)</span>
        <input
          type="text"
          .value=${form.input}
          ?disabled=${busy}
          placeholder="C:\\media\\clip.mp4"
          @input=${(event: Event) => revisions.updateForm({ input: valueOf(event) })}
        />
      </label>
      <label class="field">
        <span>What should change?</span>
        <textarea
          .value=${form.instruction}
          ?disabled=${busy}
          placeholder="Make it warmer and crop to a square"
          @input=${(event: Event) => revisions.updateForm({ instruction: valueOf(event) })}
        ></textarea>
      </label>
      <div class="creative-revision__actions">
        <button class="btn primary" ?disabled=${busy} @click=${() => void revisions.start()}>
          ${busy ? "Working…" : "Plan & preview"}
        </button>
      </div>
    </div>
    ${message
      ? html`<p
          class="creative-run__result ${message.ok
            ? "creative-run__result--ok"
            : "creative-run__result--err"}"
          role="status"
        >
          ${message.text}
        </p>`
      : nothing}
    ${session
      ? html`<p class="creative-output-path">Original: ${session.sourcePath}</p>
          <ol class="creative-revision__timeline">
            ${session.revisions.map((revision) => renderRevision(studio, revision))}
          </ol>`
      : nothing}
    <div class="creative-revision__form">
      <label class="field">
        <span>Correction</span>
        <textarea
          .value=${form.feedback}
          ?disabled=${busy || !session}
          placeholder="Less saturation, keep the original framing"
          @input=${(event: Event) => revisions.updateForm({ feedback: valueOf(event) })}
        ></textarea>
      </label>
      <div class="creative-revision__actions">
        <button class="btn" ?disabled=${busy || !session} @click=${() => void revisions.correct()}>
          Apply correction
        </button>
      </div>
      <label class="field">
        <span>Export to a new file (absolute path)</span>
        <input
          type="text"
          .value=${form.exportPath}
          ?disabled=${busy || !exportable}
          placeholder="C:\\media\\clip-edited.mp4"
          @input=${(event: Event) => revisions.updateForm({ exportPath: valueOf(event) })}
        />
      </label>
      <div class="creative-revision__actions">
        <button
          class="btn"
          ?disabled=${busy || !exportable}
          @click=${() => void revisions.export()}
        >
          Export
        </button>
        <span class="muted">Exports the latest successful revision. Existing files are kept.</span>
      </div>
    </div>
    ${session?.exports.length
      ? html`<ul class="creative-revision__exports">
          ${session.exports.map(
            (entry) =>
              html`<li class="creative-output-path">
                Revision ${entry.revision} exported to ${entry.path}
              </li>`,
          )}
        </ul>`
      : nothing}
  </section>`;
}
