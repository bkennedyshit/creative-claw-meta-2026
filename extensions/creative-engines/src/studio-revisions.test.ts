import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createPluginStateKeyedStoreForTests,
  resetPluginStateStoreForTests,
} from "openclaw/plugin-sdk/plugin-state-test-runtime";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExecutionEngine } from "./graph/executor.js";
import { ImageEngineRuntime } from "./runtime/image.js";
import {
  RevisionSessions,
  type RevisionPlanner,
  type RevisionSession,
} from "./studio-revisions.js";
import { CreativeStudio } from "./studio.js";

// Scripted stand-in for the hosted model: it proves plan validation and native execution.
// Live Meta Model API planning is proven separately through the running gateway.
function scripted(...replies: string[]) {
  const prompts: string[] = [];
  const planner = vi.fn<RevisionPlanner>(async ({ prompt }) => {
    prompts.push(prompt);
    return { text: replies.shift() ?? "{}", provider: "test", model: "scripted" };
  });
  return { planner, prompts };
}
const plan = (...capabilities: string[]) =>
  JSON.stringify({
    summary: capabilities.join(" then "),
    steps: capabilities.map((capability) => ({ capability, parameters: {} })),
  });
const pixels = async (path: string) =>
  [...(await sharp(path).ensureAlpha().raw().toBuffer()).subarray(0, 3)] as number[];

describe("Creative Studio revision sessions", () => {
  let directory: string;
  let image: ImageEngineRuntime;
  let studio: CreativeStudio;
  let source: string;
  let env: NodeJS.ProcessEnv;

  const sessions = (planner: RevisionPlanner, engines: Record<string, ExecutionEngine>) =>
    new RevisionSessions(
      studio,
      createPluginStateKeyedStoreForTests<RevisionSession>("creative-engines", {
        namespace: "studio-revisions",
        maxEntries: 500,
        env,
      }),
      engines,
      planner,
    );

  beforeEach(async () => {
    image = new ImageEngineRuntime();
    directory = await mkdtemp(join(tmpdir(), "creative-revisions-"));
    env = { ...process.env, OPENCLAW_STATE_DIR: directory };
    studio = new CreativeStudio(
      join(directory, "project"),
      createPluginStateKeyedStoreForTests("creative-engines", {
        namespace: "studio-sources",
        maxEntries: 100,
        env,
      }),
      createPluginStateKeyedStoreForTests("creative-engines", {
        namespace: "studio-runs",
        maxEntries: 100,
        env,
      }),
      { image },
    );
    source = join(directory, "portrait.png");
    await sharp({
      create: { width: 4, height: 4, channels: 4, background: { r: 20, g: 60, b: 110, alpha: 1 } },
    })
      .png()
      .toFile(source);
  });
  afterEach(async () => {
    await image.shutdown();
    resetPluginStateStoreForTests();
    await rm(directory, { recursive: true, force: true });
  });

  it("runs a planned edit natively, applies a correction to the original, and exports it", async () => {
    const original = await readFile(source);
    const { planner, prompts } = scripted(
      plan("image.invert"),
      plan("image.desaturate"),
      plan("image.invert"),
    );
    const revisions = sessions(planner, { image });

    const first = await revisions.start({ input: source, instruction: "Make a photo negative" });
    expect(first.revision).toMatchObject({
      status: "succeeded",
      kind: "edit",
      sourceUnchanged: true,
      planner: { provider: "test", model: "scripted", attempts: 1 },
      plan: { steps: [{ capability: "image.invert" }] },
    });
    expect(prompts[0]).toContain('Source: image file "portrait.png", 4x4 png');
    expect(prompts[0]).toMatch(/^image\.invert \[image->image\]/m);
    expect(await pixels(first.revision.outputPath!)).toEqual([235, 195, 145]);

    const second = await revisions.correct({
      id: first.session.id,
      feedback: "Too harsh. Make it black and white instead.",
    });
    expect(prompts[1]).toContain('Previous plan (applied to the original source): {"summary"');
    expect(prompts[1]).toContain("Correction from the creator: Too harsh.");
    expect(second.revision).toMatchObject({ index: 2, kind: "correction", status: "succeeded" });
    const [r, g, b] = await pixels(second.revision.outputPath!);
    // Grayscale of the original (dark), not of the inverted preview (light).
    expect(r).toBe(g);
    expect(g).toBe(b);
    expect(r).toBeLessThan(128);

    const exported = join(directory, "final.png");
    const result = await revisions.export({ id: first.session.id, output: exported });
    expect(result.export).toMatchObject({ path: exported, revision: 2 });
    expect(await readFile(exported)).toEqual(await readFile(second.revision.outputPath!));
    await expect(revisions.export({ id: first.session.id, output: exported })).rejects.toThrow(
      "already exists",
    );
    await expect(
      revisions.export({ id: first.session.id, output: join(directory, "final.jpg") }),
    ).rejects.toThrow("must end in .png");
    await expect(revisions.export({ id: first.session.id, output: source })).rejects.toThrow(
      "original source",
    );
    expect(await readFile(source)).toEqual(original);

    // One writer per session: an export during a running correction is refused, not interleaved.
    const running = revisions.correct({ id: first.session.id, feedback: "Invert it after all" });
    await expect(
      revisions.export({ id: first.session.id, output: join(directory, "during.png") }),
    ).rejects.toThrow("already running");
    expect((await running).revision).toMatchObject({ index: 3, status: "succeeded" });

    const reloaded = await sessions(planner, { image }).get(first.session.id);
    expect(reloaded.revisions.map((entry) => entry.status)).toEqual([
      "succeeded",
      "succeeded",
      "succeeded",
    ]);
    expect(reloaded.exports).toHaveLength(1);
  });

  it("re-asks once for malformed replies and records rejected plans without output", async () => {
    const repaired = scripted("Sure! Here is the plan.", plan("image.invert"));
    const fixed = await sessions(repaired.planner, { image }).start({
      input: source,
      instruction: "Invert it",
    });
    expect(fixed.revision).toMatchObject({ status: "succeeded", planner: { attempts: 2 } });
    expect(repaired.prompts[1]).toContain("rejected: Reply contained no JSON object");

    const invented = scripted(plan("image.make_it_pop"), plan("image.make_it_pop"));
    const failed = await sessions(invented.planner, { image }).start({
      input: source,
      instruction: "Make it pop",
    });
    expect(failed.revision.status).toBe("failed");
    expect(failed.revision.error).toContain("image.make_it_pop is not an available operation");
    expect(failed.revision.rejectedReply).toContain("make_it_pop");
    expect(failed.revision.artifactId).toBeUndefined();
    expect(failed.revision.sourceUnchanged).toBe(true);

    const huge = JSON.stringify({
      summary: "huge",
      steps: [{ capability: "image.scale", parameters: { new_width: -5, new_height: 2 } }],
    });
    const bounds = scripted(huge, huge);
    const invalid = await sessions(bounds.planner, { image }).start({
      input: source,
      instruction: "Resize",
    });
    expect(invalid.revision).toMatchObject({ status: "failed" });
    expect(invalid.revision.error).toMatch(/^Plan rejected: Step 1: .*new_width/);
    await expect(
      sessions(bounds.planner, { image }).export({ id: invalid.session.id, output: "x.png" }),
    ).rejects.toThrow("completed preview");
  });

  it("reports declined requests, planner outages, unavailable engines and bad input visibly", async () => {
    const declined = scripted(
      JSON.stringify({ summary: "No audio engine edits pixels", steps: [] }),
    );
    const refusal = await sessions(declined.planner, { image }).start({
      input: source,
      instruction: "Add music",
    });
    expect(refusal.revision.error).toBe(
      "Plan rejected: The model declined: No audio engine edits pixels",
    );
    expect(declined.planner).toHaveBeenCalledTimes(1);

    const outage = vi.fn<RevisionPlanner>(async () => {
      throw new Error('No API key found for provider "meta"');
    });
    const offline = await sessions(outage, { image }).start({ input: source, instruction: "Edit" });
    expect(offline.revision).toMatchObject({
      status: "failed",
      error: 'No API key found for provider "meta"',
    });

    const clip = join(directory, "clip.mp4");
    await writeFile(clip, "not decoded before planning");
    const missing: ExecutionEngine = {
      ensureStarted: async () => {},
      isAvailable: () => false,
      reason: () => "libomni_video_bridge not found",
      apply: async () => {
        throw new Error("unreachable");
      },
    };
    const unused = scripted();
    const noVideo = await sessions(unused.planner, { image, video: missing }).start({
      input: clip,
      instruction: "Trim the first second",
    });
    expect(noVideo.revision.error).toBe("No video engine is available on this gateway");
    expect(unused.planner).not.toHaveBeenCalled();

    const revisions = sessions(unused.planner, { image });
    await expect(
      revisions.start({ input: join(directory, "absent.png"), instruction: "Edit" }),
    ).rejects.toThrow("Source not found");
    await expect(
      revisions.start({ input: join(directory, "notes.txt"), instruction: "Edit" }),
    ).rejects.toThrow("Unsupported source type: .txt");
    await expect(revisions.start({ input: source, instruction: "  " })).rejects.toThrow(
      "Edit request must be",
    );
    await expect(revisions.correct({ id: "revision-missing", feedback: "x" })).rejects.toThrow(
      "not found",
    );
  });
});
