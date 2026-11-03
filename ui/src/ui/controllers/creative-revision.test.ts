import { render } from "lit";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GatewayBrowserClient } from "../gateway.ts";
import { renderCreativeRevision } from "../views/creative-revision.ts";
import type { CreativeRevision, CreativeRevisionSession } from "./creative-revision.ts";
import { CreativeStudioController } from "./creative-studio.ts";

const planner = { provider: "meta", model: "muse-spark", attempts: 1 };
const succeeded: CreativeRevision = {
  index: 1,
  kind: "edit",
  request: "Make it warmer",
  status: "succeeded",
  planner,
  plan: {
    summary: "Warm the color balance",
    steps: [{ capability: "image.adjust_color", parameters: { temperature: 0.2 } }],
  },
  artifactId: "artifact-1",
  previewUrl: "/plugins/creative-engines/artifacts/artifact-1",
  outputPath: "C:/project/outputs/revision-1.png",
  sourceUnchanged: true,
  createdAt: "2026-11-02T00:00:00.000Z",
};
const failed: CreativeRevision = {
  index: 2,
  kind: "correction",
  request: "Add a laser show",
  status: "failed",
  planner: { ...planner, attempts: 2 },
  error: "Plan rejected: Step 1: image.lasers is not an available operation on this gateway",
  sourceUnchanged: true,
  createdAt: "2026-11-02T00:01:00.000Z",
};
const sessionWith = (...revisions: CreativeRevision[]): CreativeRevisionSession => ({
  id: "revision-1",
  sourcePath: "C:/media/photo.png",
  sourceType: "image",
  sourceHash: "hash",
  instruction: "Make it warmer",
  revisions,
  exports: [],
  createdAt: succeeded.createdAt,
  updatedAt: succeeded.createdAt,
});

describe("Creative revision loop client", () => {
  let studio: CreativeStudioController;
  let request: ReturnType<typeof vi.fn>;
  let preview: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    request = vi.fn(async () => ({}));
    studio = new CreativeStudioController({
      connected: true,
      client: { request } as unknown as GatewayBrowserClient,
      addController() {},
      removeController() {},
      requestUpdate() {},
      updateComplete: Promise.resolve(true),
    });
    preview = vi.spyOn(studio, "showPreview").mockResolvedValue();
    studio.revisions.updateForm({ input: " C:/media/photo.png ", instruction: "Make it warmer" });
  });

  it("starts an edit, stores the session and previews the planned revision", async () => {
    request.mockResolvedValue({ session: sessionWith(succeeded), revision: succeeded });
    await studio.revisions.start();
    expect(request).toHaveBeenCalledWith("creative.studio.revision.start", {
      input: "C:/media/photo.png",
      instruction: "Make it warmer",
    });
    expect(studio.revisions.session?.id).toBe("revision-1");
    expect(studio.revisions.busy).toBe(false);
    expect(studio.revisions.message).toEqual({
      ok: true,
      text: "Revision 1 ready: Warm the color balance",
    });
    expect(preview).toHaveBeenCalledWith({
      id: "artifact-1",
      path: succeeded.outputPath,
      type: "image",
      previewUrl: succeeded.previewUrl,
    });
  });

  it("sends corrections by session id and reports a failed plan with its model", async () => {
    studio.revisions.session = sessionWith(succeeded);
    studio.revisions.updateForm({ feedback: "Add a laser show" });
    request.mockResolvedValue({ session: sessionWith(succeeded, failed), revision: failed });
    await studio.revisions.correct();
    expect(request).toHaveBeenCalledWith("creative.studio.revision.correct", {
      id: "revision-1",
      feedback: "Add a laser show",
    });
    expect(studio.revisions.message?.ok).toBe(false);
    expect(studio.revisions.message?.text).toContain(failed.error);
    expect(studio.revisions.message?.text).toContain("meta/muse-spark · 2 attempts");
    expect(studio.revisions.session?.revisions).toHaveLength(2);
    expect(preview).not.toHaveBeenCalled();
  });

  it("exports to a new path and records the export", async () => {
    const record = {
      path: "C:/media/photo-warm.png",
      revision: 1,
      contentHash: "h",
      exportedAt: "",
    };
    studio.revisions.session = sessionWith(succeeded);
    studio.revisions.updateForm({ exportPath: record.path });
    request.mockResolvedValue({
      session: { ...sessionWith(succeeded), exports: [record] },
      export: record,
    });
    await studio.revisions.export();
    expect(request).toHaveBeenCalledWith("creative.studio.revision.export", {
      id: "revision-1",
      output: record.path,
    });
    expect(studio.revisions.session?.exports).toEqual([record]);
    expect(studio.revisions.message).toEqual({
      ok: true,
      text: `Exported revision 1 to ${record.path}`,
    });
  });

  it("shows backend errors verbatim instead of reporting success", async () => {
    request.mockResolvedValue({ ok: false, error: 'No API key found for provider "meta"' });
    await studio.revisions.start();
    expect(studio.revisions.message).toEqual({
      ok: false,
      text: 'No API key found for provider "meta"',
    });
    expect(studio.revisions.session).toBeUndefined();
    expect(studio.revisions.busy).toBe(false);
  });

  it("rejects an empty edit request without calling the gateway", async () => {
    studio.revisions.updateForm({ instruction: "   " });
    await studio.revisions.start();
    expect(request).not.toHaveBeenCalled();
    expect(studio.revisions.message).toEqual({ ok: false, text: "Describe the edit you want." });
  });

  it("restores the latest session on load and renders its timeline", async () => {
    request.mockResolvedValue({ sessions: [sessionWith(succeeded, failed)] });
    await studio.revisions.load();
    expect(request).toHaveBeenCalledWith("creative.studio.revision.list", {});
    const container = document.createElement("div");
    render(renderCreativeRevision(studio), container);
    const text = container.textContent ?? "";
    for (const expected of [
      "Describe an edit",
      "Each plan is applied to the untouched original.",
      "planned by meta/muse-spark · 1 attempt",
      "Warm the color balance",
      'image.adjust_color {"temperature":0.2}',
      `Saved at: ${succeeded.outputPath}`,
      "Original unchanged",
      failed.error!,
    ]) {
      expect(text).toContain(expected);
    }
    const button = [...container.querySelectorAll("button")].find((entry) =>
      entry.textContent?.includes("Preview revision 1"),
    );
    button!.click();
    expect(preview).toHaveBeenCalledWith(expect.objectContaining({ id: "artifact-1" }));
    render(null, container);
  });
});
