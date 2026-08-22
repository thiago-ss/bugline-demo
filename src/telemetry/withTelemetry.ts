import type { TelemetryBuffer } from "./telemetry";

/** Wrap a fetch call so failed requests are recorded in the telemetry buffer. */
export function trackedFetch(
  telemetry: TelemetryBuffer,
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const request = new Request(input, init);
  const method = request.method;
  const path = new URL(request.url).pathname;
  const started = performance.now();
  return fetch(request).then(
    (response) => {
      if (!response.ok) {
        telemetry.trackRequest({
          method,
          path,
          status: response.status,
          durationMs: Math.round(performance.now() - started),
          traceId: response.headers.get("x-bugline-trace") ?? undefined,
        });
      }
      return response;
    },
    (error: unknown) => {
      telemetry.trackRequest({
        method,
        path,
        status: 0,
        durationMs: Math.round(performance.now() - started),
      });
      telemetry.trackError({
        name: error instanceof Error ? error.name : "FetchError",
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    },
  );
}
