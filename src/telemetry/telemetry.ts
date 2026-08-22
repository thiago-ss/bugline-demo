import type { BrowserContext } from "../shared/contracts";
import { redact } from "../shared/redact";

export type CapturedAction = { label: string; timestamp: string };

export type CapturedRequest = {
  method: string;
  path: string;
  status: number;
  durationMs: number;
  traceId?: string;
};

export type CapturedError = { name: string; message: string };

const MAX_ACTIONS = 10;
const MAX_REQUESTS = 5;
const MAX_ERRORS = 5;

export function nowIso(): string {
  return new Date().toISOString();
}

function parseBuildId(): string {
  const meta = document.querySelector('meta[name="build-id"]');
  if (meta?.getAttribute("content")) {
    return meta.getAttribute("content")!;
  }
  return `dev-${Math.random().toString(36).slice(2, 8)}`;
}

function browserFamily(): string {
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return "edge";
  if (/Firefox\//.test(ua)) return "firefox";
  if (/Chrome\//.test(ua)) return "chrome";
  if (/Safari\//.test(ua)) return "safari";
  return "unknown";
}

export class TelemetryBuffer {
  private actions: CapturedAction[] = [];
  private requests: CapturedRequest[] = [];
  private errors: CapturedError[] = [];
  private readonly route: string;
  private readonly buildId: string;

  constructor(route: string, buildId = parseBuildId()) {
    this.route = route;
    this.buildId = buildId;
  }

  trackAction(label: string): void {
    this.actions.push({ label: redact(label), timestamp: nowIso() });
    if (this.actions.length > MAX_ACTIONS) {
      this.actions = this.actions.slice(this.actions.length - MAX_ACTIONS);
    }
  }

  trackRequest(entry: CapturedRequest): void {
    this.requests.push({
      ...entry,
      path: redact(entry.path),
      traceId: entry.traceId ? redact(entry.traceId) : undefined,
    });
    if (this.requests.length > MAX_REQUESTS) {
      this.requests = this.requests.slice(this.requests.length - MAX_REQUESTS);
    }
  }

  trackError(error: { name?: string; message?: string }): void {
    this.errors.push({
      name: redact(error.name ?? "Error"),
      message: redact(error.message ?? "Unknown error"),
    });
    if (this.errors.length > MAX_ERRORS) {
      this.errors = this.errors.slice(this.errors.length - MAX_ERRORS);
    }
  }

  snapshot(viewport = `${window.innerWidth}x${window.innerHeight}`): BrowserContext {
    return {
      route: redact(this.route),
      buildId: this.buildId,
      browser: browserFamily(),
      viewport,
      actions: [...this.actions],
      failedRequests: [...this.requests],
      errors: [...this.errors],
    };
  }

  reset(): void {
    this.actions = [];
    this.requests = [];
    this.errors = [];
  }
}
