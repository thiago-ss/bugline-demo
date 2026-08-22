import type {
  BrowserContext,
  CreateIssueRequest,
  SearchIssuesRequest,
  SearchIssuesResponse,
  SessionResponse,
} from "../shared/contracts";
import { redactObject } from "../shared/redact";
import {
  createGitHubIssue,
  extractFingerprintFromBody,
  fetchOpenBugIssues,
  rankDuplicates,
  validateAndRedactDraft,
} from "./github";
import { verifyWebhookSignature } from "./webhook";

export interface Env {
  ELEVENLABS_API_KEY: string;
  ELEVENLABS_AGENT_ID: string;
  GITHUB_TOKEN: string;
  GITHUB_REPO: string;
  WEBHOOK_SECRET: string;
  ALLOWED_ORIGINS?: string;
  BUILD_ID?: string;
}

export interface WebhookToolPayload {
  tool: string;
  payload: Record<string, unknown>;
}

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: JSON_HEADERS,
  });
}

function error(message: string, status = 400): Response {
  return json({ error: message }, status);
}

function traceId(): string {
  return crypto.randomUUID();
}

function clientIp(request: Request): string {
  const forwarded = request.headers.get("CF-Connecting-IP");
  return forwarded ?? "unknown";
}

function addCors(request: Request, response: Response): Response {
  const allowed = (request.headers.get("Origin") ?? "").split(",").map((o) => o.trim());
  const origin = request.headers.get("Origin") ?? "";
  if (allowed.includes(origin)) {
    const headers = new Headers(response.headers);
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
    headers.set("Access-Control-Allow-Headers", "Content-Type");
    headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    return new Response(response.body, { status: response.status, headers });
  }
  return response;
}

async function handleSession(request: Request, env: Env): Promise<Response> {
  const ip = clientIp(request);
  const minute = Math.floor(Date.now() / 60_000);
  const key = `rl:${ip}:${minute}`;
  const cache = await caches.open("bugline-rate-limit");
  const cached = await cache.match(new Request(`https://rate-limit/${key}`));
  const count = cached ? Number(await cached.text()) : 0;
  if (count >= 3) {
    return error("Too many session requests. Try again shortly.", 429);
  }
  await cache.put(
    new Request(`https://rate-limit/${key}`),
    new Response(String(count + 1), {
      headers: { "Cache-Control": "public, max-age=60" },
    }),
  );

  const includeConversationId = request.headers.get("X-Require-Conversation-Id") === "true";
  const params = new URLSearchParams({
    agent_id: env.ELEVENLABS_AGENT_ID,
    include_conversation_id: String(includeConversationId),
    environment: "production",
  });
  const response = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?${params.toString()}`,
    {
      headers: { "xi-api-key": env.ELEVENLABS_API_KEY },
    },
  );
  if (!response.ok) {
    return error("Unable to start a voice session right now.", 503);
  }
  const body = (await response.json()) as { signed_url?: string; signedUrl?: string };
  const signedUrl = body.signed_url ?? body.signedUrl;
  if (!signedUrl) {
    return error("Voice session unavailable.", 503);
  }
  const payload: SessionResponse = {
    signedUrl,
    mode: "voice",
    agentId: env.ELEVENLABS_AGENT_ID,
  };
  return json(payload);
}

async function handleApplyCoupon(request: Request): Promise<Response> {
  const raw = (await request.json().catch(() => ({}))) as {
    code?: string;
    email?: string;
    cardLast4?: string;
  };
  const code = String(raw.code ?? "").trim().toUpperCase();
  if (!code) {
    return error("Coupon code is required.");
  }
  if (code === "SAVE20") {
    // Deterministic seeded failure used by the demo and the voice agent.
    return json(
      {
        ok: false,
        code: "PROMO_ENGINE_TIMEOUT",
        message: "Promo engine timed out after 2s while validating SAVE20.",
        traceId: `tracetest-${crypto.randomUUID().slice(0, 8)}`,
      },
      500,
    );
  }
  return json({ ok: true, discountPercent: 10, appliedCode: code });
}

async function handleSearchIssues(
  request: Request,
  env: Env,
): Promise<Response> {
  const raw = (await request.json().catch(() => ({}))) as SearchIssuesRequest;
  if (typeof raw.fingerprint !== "string" || raw.fingerprint.length < 8) {
    return error("fingerprint is required.");
  }
  const title = String(raw.title ?? "").slice(0, 180);
  const summary = String(raw.summary ?? "").slice(0, 2000);
  const severity =
    raw.severity === "low" || raw.severity === "medium" || raw.severity === "high"
      ? raw.severity
      : "medium";

  try {
    const issues = await fetchOpenBugIssues(env.GITHUB_TOKEN, env.GITHUB_REPO);
    const candidates = rankDuplicates({ fingerprint: raw.fingerprint, title, summary }, issues);
    const payload: SearchIssuesResponse = {
      candidates: candidates.map((candidate) => ({
        ...candidate,
        severity,
      })),
    };
    return json(payload);
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : "Duplicate search failed.";
    return error(message, 502);
  }
}

async function handleCreateIssue(
  request: Request,
  env: Env,
): Promise<Response> {
  const raw = (await request.json().catch(() => ({}))) as CreateIssueRequest;
  const draft = validateAndRedactDraft(raw.draft);
  if (!draft) {
    return error("Draft failed validation.");
  }
  try {
    // Idempotency pre-check: an open issue with this exact fingerprint already
    // exists, so return it instead of creating a duplicate.
    const existing = await fetchOpenBugIssues(env.GITHUB_TOKEN, env.GITHUB_REPO);
    const duplicate = existing.find(
      (issue) => extractFingerprintFromBody(issue.body) === draft.fingerprint,
    );
    if (duplicate) {
      return json({
        result: {
          status: "duplicate",
          number: duplicate.number,
          url: duplicate.html_url,
        },
      });
    }
    const result = await createGitHubIssue(env.GITHUB_TOKEN, env.GITHUB_REPO, draft);
    return json({ result });
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : "Issue creation failed.";
    return error(message, 502);
  }
}

function buildContextSummary(context: BrowserContext): string {
  return [
    `Route ${context.route}, build ${context.buildId}, ${context.browser} ${context.viewport}.`,
    `${context.actions.length} recent actions, ${context.failedRequests.length} failed requests, ${context.errors.length} errors.`,
    context.failedRequests.length > 0
      ? `Latest failure: ${context.failedRequests[0].method} ${context.failedRequests[0].path} → ${context.failedRequests[0].status}.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
}

async function handleWebhookTool(
  payload: WebhookToolPayload,
  env: Env,
): Promise<Response> {
  const tool = payload.tool;
  const body = payload.payload ?? {};
  if (tool === "github_duplicate_search") {
    const request = body as SearchIssuesRequest;
    if (typeof request.fingerprint !== "string" || request.fingerprint.length < 8) {
      return json({ ok: false, error: "fingerprint is required." }, 400);
    }
    try {
      const issues = await fetchOpenBugIssues(env.GITHUB_TOKEN, env.GITHUB_REPO);
      return json({
        ok: true,
        candidates: rankDuplicates(
          {
            fingerprint: request.fingerprint,
            title: String(request.title ?? ""),
            summary: String(request.summary ?? ""),
          },
          issues,
        ),
      });
    } catch (reason: unknown) {
      return json(
        {
          ok: false,
          retryable: true,
          error:
            reason instanceof Error ? reason.message : "Duplicate search failed.",
        },
        502,
      );
    }
  }

  if (tool === "github_issue_create") {
    const draft = validateAndRedactDraft(body.draft ?? body);
    if (!draft) {
      return json({ ok: false, error: "Draft failed validation." }, 400);
    }
    try {
      const result = await createGitHubIssue(
        env.GITHUB_TOKEN,
        env.GITHUB_REPO,
        draft,
      );
      return json({ ok: true, result });
    } catch (reason: unknown) {
      return json(
        {
          ok: false,
          retryable: true,
          error:
            reason instanceof Error ? reason.message : "Issue creation failed.",
        },
        502,
      );
    }
  }

  if (tool === "capture_context_probe") {
    const context = redactObject(body) as BrowserContext;
    return json({
      ok: true,
      summary: buildContextSummary(context),
      fields: Object.keys(context),
    });
  }

  return json({ ok: false, error: `Unknown tool: ${tool}` }, 400);
}

async function handleWebhook(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return error("Method not allowed.", 405);
  }
  const rawBody = await request.text();
  const signature = request.headers.get("elevenlabs-signature");
  if (!verifyWebhookSignature(rawBody, signature, env.WEBHOOK_SECRET)) {
    return error("Invalid signature.", 401);
  }
  const body = (await JSON.parse(rawBody).catch(() => null)) as
    | { tool?: string; payload?: Record<string, unknown> }
    | null;
  if (!body || typeof body.tool !== "string") {
    return error("Invalid webhook payload.", 400);
  }
  return handleWebhookTool(
    { tool: body.tool, payload: body.payload ?? {} },
    env,
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const response =
      url.pathname === "/api/agent/session"
        ? await handleSession(request, env)
        : url.pathname === "/api/demo/apply-coupon" && request.method === "POST"
          ? await handleApplyCoupon(request)
          : url.pathname === "/api/issues/search" && request.method === "POST"
            ? await handleSearchIssues(request, env)
            : url.pathname === "/api/issues/create" && request.method === "POST"
              ? await handleCreateIssue(request, env)
              : url.pathname === "/api/webhook" || url.pathname === "/api/webhook/"
                ? await handleWebhook(request, env)
                : new Response(null, { status: 404 });

    const withTrace = new Response(response.body, {
      status: response.status,
      headers: new Headers(response.headers),
    });
    withTrace.headers.set("x-bugline-trace", traceId());
    return addCors(request, withTrace);
  },
};
