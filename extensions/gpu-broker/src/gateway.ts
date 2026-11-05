import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import type { GpuBroker } from "./broker.js";
import { BrokerState } from "./types.js";

const STUDIO_OWNER = "creative-studio";

/** Browser controls use the same live broker as agent tools, with write-scoped mutations. */
export function registerGpuGateway(
  api: Pick<OpenClawPluginApi, "registerGatewayMethod">,
  getBroker: () => GpuBroker | null,
) {
  let changing = false;
  api.registerGatewayMethod(
    "gpu.status",
    async ({ respond }) => {
      const broker = getBroker();
      const snapshot = broker?.readGpuSnapshot();
      respond(true, {
        state: broker?.getState() ?? "unavailable",
        usedMb: snapshot?.usedMb ?? 0,
        totalMb: snapshot?.totalMb ?? 0,
        models: (await broker?.getResidentModels()) ?? [],
        dormant: broker?.getState() === BrokerState.Dormant,
        leaseOwner: broker?.getLease()?.owner ?? null,
      });
    },
    { scope: "operator.read" },
  );

  for (const action of ["release", "reclaim"] as const) {
    api.registerGatewayMethod(
      `gpu.${action}`,
      async ({ respond }) => {
        const broker = getBroker();
        if (!broker || changing) {
          respond(true, {
            ok: false,
            error: broker ? "GPU action already running" : "GPU broker unavailable",
          });
          return;
        }
        changing = true;
        try {
          if (action === "release") {
            if (broker.getLease() || broker.getState() === BrokerState.Draining) {
              throw new Error(
                "GPU is already claimed. End its current lease before releasing again.",
              );
            }
            const deadline = Date.now() + 5000;
            const signal = AbortSignal.timeout(5000);
            const lease = await broker.release(
              STUDIO_OWNER,
              "Released from Creative Studio",
              undefined,
              { strict: true, signal },
            );
            try {
              // Ollama acknowledges unloading before /api/ps always reflects it.
              // Wait briefly, but never claim success if status fails or models remain.
              while (
                (
                  await broker.getResidentModels({
                    strict: true,
                    signal,
                  })
                ).length > 0
              ) {
                if (Date.now() >= deadline) {
                  throw new Error("Some Ollama models remain loaded. Check other apps and retry.");
                }
                await new Promise<void>((resolve) => {
                  setTimeout(resolve, 200);
                });
              }
            } catch (error) {
              broker.reclaim(lease.token);
              throw error;
            }
          } else {
            const lease = broker.getLease();
            if (!lease || lease.owner !== STUDIO_OWNER || !broker.reclaim(lease.token)) {
              throw new Error("No Creative Studio GPU lease to return.");
            }
          }
          respond(true, { ok: true });
        } catch (error) {
          respond(true, {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
        } finally {
          changing = false;
        }
      },
      { scope: "operator.write" },
    );
  }
}
