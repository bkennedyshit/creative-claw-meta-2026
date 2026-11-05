import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GpuBroker } from "./broker.js";
import { registerGpuGateway } from "./gateway.js";

type Handler = Parameters<OpenClawPluginApi["registerGatewayMethod"]>[1];

describe("Studio GPU controls", () => {
  const brokers: GpuBroker[] = [];
  afterEach(() => {
    for (const broker of brokers.splice(0)) {
      broker.stop();
    }
    vi.restoreAllMocks();
    vi.useRealTimers();
  });
  function setup() {
    const broker = new GpuBroker();
    brokers.push(broker);
    const evict = vi.spyOn(broker, "evictAllModels").mockResolvedValue();
    const resident = vi.spyOn(broker, "getResidentModels").mockResolvedValue([]);
    const handlers = new Map<string, Handler>();
    const registerGatewayMethod = vi.fn<OpenClawPluginApi["registerGatewayMethod"]>(
      (name, handler) => {
        handlers.set(name, handler);
      },
    );
    registerGpuGateway({ registerGatewayMethod }, () => broker);
    async function call(name: string) {
      const respond = vi.fn();
      await handlers.get(name)!({ respond } as Parameters<Handler>[0]);
      return respond.mock.calls[0][1] as { ok: boolean; error?: string };
    }
    return { broker, call, registerGatewayMethod, evict, resident };
  }
  it("does not allow a direct caller to replace an in-flight Studio acquisition", async () => {
    const { broker, call, evict } = setup();
    let finish!: () => void;
    evict.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const pending = call("gpu.release");
    await expect(broker.release("native-engine")).rejects.toThrow("already in progress");
    finish();
    expect(await pending).toEqual({ ok: true });
    expect(broker.getLease()?.owner).toBe("creative-studio");
  });

  it("evicts through the live broker and returns only the Studio-owned lease", async () => {
    const { broker, call, registerGatewayMethod, evict } = setup();
    expect(await call("gpu.release")).toEqual({ ok: true });
    expect(evict).toHaveBeenCalledOnce();
    expect(broker.getLease()?.owner).toBe("creative-studio");
    expect(await call("gpu.reclaim")).toEqual({ ok: true });
    expect(broker.getLease()).toBeNull();
    expect(registerGatewayMethod).toHaveBeenCalledWith("gpu.release", expect.any(Function), {
      scope: "operator.write",
    });
    expect(registerGatewayMethod).toHaveBeenCalledWith("gpu.reclaim", expect.any(Function), {
      scope: "operator.write",
    });
  });
  it("does not replace or reclaim another caller's lease", async () => {
    const { broker, call } = setup();
    const lease = await broker.release("another-app");
    expect((await call("gpu.release")).ok).toBe(false);
    expect((await call("gpu.reclaim")).ok).toBe(false);
    expect(broker.getLease()?.token).toBe(lease.token);
  });
  it("reports failed eviction without leaving a new lease", async () => {
    vi.useFakeTimers();
    const { broker, call, resident } = setup();
    resident.mockResolvedValue(["still-loaded"]);
    const result = call("gpu.release");
    await vi.advanceTimersByTimeAsync(5000);
    expect(await result).toMatchObject({
      ok: false,
      error: expect.stringContaining("remain loaded"),
    });
    expect(broker.getLease()).toBeNull();
  });
  it("waits for asynchronous unloading and fails honestly when status is unavailable", async () => {
    vi.useFakeTimers();
    const { broker, call, resident } = setup();
    resident.mockResolvedValueOnce(["unloading"]).mockResolvedValueOnce([]);
    const released = call("gpu.release");
    await vi.advanceTimersByTimeAsync(200);
    expect(await released).toEqual({ ok: true });
    await call("gpu.reclaim");
    resident.mockRejectedValueOnce(new Error("Ollama unavailable"));
    expect(await call("gpu.release")).toEqual({ ok: false, error: "Ollama unavailable" });
    expect(broker.getLease()).toBeNull();
  });
  it("cleans up the lease when the verification request stalls", async () => {
    const { broker, call, resident } = setup();
    resident.mockImplementation(
      ({ signal } = {}) =>
        new Promise((_, reject) => {
          signal!.addEventListener(
            "abort",
            () => reject(new Error("Ollama status request timed out")),
            { once: true },
          );
        }),
    );
    expect((await call("gpu.release")).ok).toBe(false);
    expect(broker.getLease()).toBeNull();
  }, 10000);
});
