import {
  createExecutionContext,
  waitOnExecutionContext,
} from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import worker from "../src/worker/index";

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

async function call(path: string, init?: RequestInit): Promise<Response> {
  const ctx = createExecutionContext();
  const response = await worker.fetch(
    new IncomingRequest(`https://bugline.test${path}`, init),
    env,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return response;
}

describe("worker endpoints", () => {
  it("returns the deterministic coupon failure", async () => {
    const response = await call("/api/demo/apply-coupon", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "SAVE20" }),
    });
    expect(response.status).toBe(500);
    const body = (await response.json()) as { code: string; ok: boolean };
    expect(body.code).toBe("PROMO_ENGINE_TIMEOUT");
    expect(body.ok).toBe(false);
  });

  it("rejects malformed issue drafts", async () => {
    const response = await call("/api/issues/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draft: { title: "x" } }),
    });
    expect(response.status).toBe(400);
  });
});
