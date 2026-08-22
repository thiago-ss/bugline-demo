import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TelemetryBuffer } from "../src/telemetry/telemetry";

describe("TelemetryBuffer", () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>).window = globalThis;
  });
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).window;
  });

  it("captures the last 10 actions", () => {
    const buffer = new TelemetryBuffer("/checkout", "build-1");
    for (let i = 0; i < 14; i++) {
      buffer.trackAction(`action ${i}`);
    }
    const snapshot = buffer.snapshot();
    expect(snapshot.actions).toHaveLength(10);
    expect(snapshot.actions[0].label).toBe("action 4");
    expect(snapshot.actions[9].label).toBe("action 13");
  });

  it("captures the last 5 requests and 5 errors", () => {
    const buffer = new TelemetryBuffer("/checkout", "build-1");
    for (let i = 0; i < 8; i++) {
      buffer.trackRequest({ method: "POST", path: "/api/x", status: 500, durationMs: i });
      buffer.trackError({ name: "Err", message: `m${i}` });
    }
    const snapshot = buffer.snapshot();
    expect(snapshot.failedRequests).toHaveLength(5);
    expect(snapshot.errors).toHaveLength(5);
    expect(snapshot.failedRequests[0].path).toBe("/api/x");
    expect(snapshot.errors[0].message).toBe("m3");
  });

  it("redacts sensitive values in captures", () => {
    const buffer = new TelemetryBuffer("/checkout", "build-1");
    buffer.trackAction("email qa.tester@example.com");
    buffer.trackRequest({
      method: "GET",
      path: "/api?token=abc123def456",
      status: 500,
      durationMs: 10,
    });
    buffer.trackError({ name: "Error", message: "ghp_abcdefghijklmnopqrstuvwxyz123456" });
    const snapshot = buffer.snapshot();
    expect(snapshot.actions[0].label).toContain("[email-redacted]");
    expect(snapshot.failedRequests[0].path).toBe("/api");
    expect(snapshot.errors[0].message).toContain("[token-redacted]");
  });

  it("reset clears all buffers", () => {
    const buffer = new TelemetryBuffer("/checkout", "build-1");
    buffer.trackAction("a");
    buffer.trackRequest({ method: "GET", path: "/x", status: 500, durationMs: 1 });
    buffer.trackError({ name: "E", message: "m" });
    buffer.reset();
    const snapshot = buffer.snapshot();
    expect(snapshot.actions).toHaveLength(0);
    expect(snapshot.failedRequests).toHaveLength(0);
    expect(snapshot.errors).toHaveLength(0);
  });
});
