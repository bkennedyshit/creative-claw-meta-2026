import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildConfig,
  childEnvironment,
  DEFAULT_MODEL,
  DEFAULT_PORT,
  META_ENDPOINT,
  pathsFor,
  requireSponsorKey,
  setup,
  summarizeRevision,
} from "../../scripts/meta-hackathon.mjs";

describe("Meta hackathon setup boundaries", () => {
  it("makes local native testing independent of Meta credentials", () => {
    const paths = pathsFor(path.join(tmpdir(), "meta-test"), true);
    const config = buildConfig({ paths, local: true, token: "test-token" });
    expect(config).not.toHaveProperty("models");
    expect(config.agents.defaults).not.toHaveProperty("model");
    expect(config.gateway).toMatchObject({
      port: DEFAULT_PORT,
      bind: "loopback",
      auth: { mode: "token" },
    });
    expect(config.agents.defaults.heartbeat.every).toBe("0m");
  });

  it("routes planning through Meta Responses with an env secret and a valid reasoning floor", () => {
    const paths = pathsFor(path.join(tmpdir(), "meta-test"));
    const config = buildConfig({ paths, token: "test-token" });
    const provider = config.models.providers.meta;
    expect(provider).toMatchObject({
      baseUrl: META_ENDPOINT,
      api: "openai-responses",
      apiKey: { source: "env", provider: "default", id: "MODEL_API_KEY" },
    });
    // The Responses transport sends thinkingLevelMap.off when no effort is requested;
    // Meta rejects "none", so this mapping must never be absent or "none".
    expect(provider.models[0]).toMatchObject({
      id: DEFAULT_MODEL,
      reasoning: true,
      thinkingLevelMap: { off: "low" },
    });
    expect(config.agents.defaults.model.primary).toBe(`meta/${DEFAULT_MODEL}`);
    expect(() => requireSponsorKey({})).toThrow("MODEL_API_KEY is missing");
    expect(() => requireSponsorKey({ MODEL_API_KEY: "  " })).toThrow();
    expect(() => buildConfig({ paths, model: "gpt-5.5", token: "t" })).toThrow("Muse model");
    expect(
      buildConfig({ paths, model: "muse-wonder-1.0", token: "t" }).agents.defaults.model,
    ).toEqual({ primary: "meta/muse-wonder-1.0" });
  });

  it("keeps state and ports isolated from the original and Nebius gateways", () => {
    const base = path.join(tmpdir(), "meta-test");
    const paths = pathsFor(base);
    const child = childEnvironment(paths, {
      OPENCLAW_STATE_DIR: "original",
      OPENCLAW_CONFIG_PATH: "original.json",
      OPENCLAW_GATEWAY_URL: "ws://127.0.0.1:18789",
      OPENCLAW_GATEWAY_TOKEN: "original-token",
      KEEP: "yes",
    });
    expect(child).toMatchObject({
      OPENCLAW_STATE_DIR: paths.state,
      OPENCLAW_CONFIG_PATH: paths.config,
      KEEP: "yes",
    });
    expect(child.OPENCLAW_GATEWAY_URL).toBeUndefined();
    expect(child.OPENCLAW_GATEWAY_TOKEN).toBeUndefined();
    expect(pathsFor(base, true).state).not.toBe(paths.state);
    for (const port of [18789, 18990]) {
      expect(() => buildConfig({ paths, port, token: "test" })).toThrow("dedicated port");
    }
    const memory = buildConfig({ paths, token: "t" }).plugins.entries["visual-memory"].config;
    expect(path.relative(paths.state, memory.storePath)).toBe("visual-memory");
  });

  it("never overwrites an existing configured profile or stores the key", () => {
    const base = mkdtempSync(path.join(tmpdir(), "meta-profile-"));
    try {
      const paths = pathsFor(base);
      setup({ paths, local: false });
      const original = readFileSync(paths.config, "utf8");
      expect(() => setup({ paths, local: false, port: 18992 })).toThrow("already has a config");
      expect(readFileSync(paths.config, "utf8")).toBe(original);
      expect(original).toContain('"id": "MODEL_API_KEY"');
      expect(original).not.toMatch(/"apiKey":\s*"/);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("summarizes revision traces without dropping failures", () => {
    expect(
      summarizeRevision({
        index: 1,
        kind: "edit",
        request: "Invert",
        status: "failed",
        sourceUnchanged: true,
        planner: { provider: "meta", model: DEFAULT_MODEL, attempts: 2 },
        error: "Plan rejected: Step 1: image.x is not an available operation on this gateway",
      }),
    ).toMatchObject({
      status: "failed",
      provider: "meta",
      model: DEFAULT_MODEL,
      plannerAttempts: 2,
      plan: null,
      sourceUnchanged: true,
      error: expect.stringContaining("not an available operation"),
    });
  });
});
