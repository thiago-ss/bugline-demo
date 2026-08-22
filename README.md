# Bugline — Voice QA Agent Demo

Bugline is a staged checkout that pairs with an ElevenLabs voice agent to turn a
vague spoken bug report into a real, structured GitHub issue. The demo seeds a
deterministic coupon failure, captures sanitized browser evidence, checks for
duplicates, previews the proposed issue, and only creates it after spoken
confirmation.

Live app: https://bugline-demo.test-gg.workers.dev

Issues land in the public demo repo:
https://github.com/thiago-ss/bugline-demo

## The golden path

1. Open the app, add a product so the cart exceeds `$50`, and apply the `SAVE20`
   promo. Checkout returns `PROMO_ENGINE_TIMEOUT` with a trace ID.
2. Start the voice session. Tell the agent you were checking out and the SAVE20
   coupon failed.
3. The agent captures the last 10 actions, 5 failed requests, and 5 errors,
   checks open `bug` issues for a duplicate, and renders a preview.
4. Confirm aloud. The worker creates a GitHub issue with summary, actual,
   expected, reproduction, environment, evidence, report-session ID, and a
   hidden fingerprint marker. Repeating the same report returns the existing
   issue instead of creating a duplicate.

## Architecture

```text
Staging checkout UI
  ├─ records allowlisted browser telemetry
  ├─ sends failure context to ElevenLabs
  └─ exposes client tools
          ↓
ElevenLabs workflow
  Intake → Evidence → Duplicate check → Review → Confirm → Submit
          ↓
Cloudflare Worker webhooks
  ├─ GitHub duplicate search
  └─ GitHub issue creation
```

The app is a React + TypeScript + Vite SPA served by a Cloudflare Worker with
static assets. The Worker owns all secrets (ElevenLabs API key, GitHub token,
webhook secret) and exposes only:

- `GET /api/agent/session` — rate-limited signed ElevenLabs session URL.
- `POST /api/demo/apply-coupon` — deterministic seeded failure for `SAVE20`.
- `POST /api/issues/search` — validated duplicate search over open `bug`
  issues, ranked by exact fingerprint then title similarity.
- `POST /api/issues/create` — validates and redacts the draft, rechecks the
  fingerprint for idempotency, creates the GitHub issue, and returns the result.
- `POST /api/webhook` — HMAC-verified ElevenLabs webhook tool calls.

Client tools registered on the React side (matching the ElevenLabs agent
configuration):

- `capture_browser_context` — returns sanitized route, build, browser,
  viewport, actions, failed requests, and errors.
- `render_issue_preview` — renders the proposed issue and returns success.
- `render_submission_result` — renders the created/existing issue link.

## Privacy

Telemetry only ever captures method, pathname, status, duration, trace ID,
error name/message, route, viewport, browser family, and build ID. Redaction
runs on capture and again server-side: emails, tokens, card-like numbers,
query strings, and long opaque strings are replaced before anything leaves the
browser or is persisted. Cookies, storage, headers, request bodies, form
values, DOM dumps, screenshots, and full transcripts are never captured.

## Security

- ElevenLabs agent uses signed session URLs and a restricted API key.
- GitHub token is scoped to issues read/write on the demo repo only.
- Webhook calls require the shared HMAC secret and reject stale timestamps.
- Every webhook and issue endpoint validates input and redacts output.
- The signed-session endpoint is rate limited to 3 requests per IP per minute.

## Development

```bash
npm install
npm run dev        # Vite dev server with the Cloudflare plugin
npm run build      # type check + production build
npm run lint       # oxlint
npm test           # ui + unit + worker suites
npm run deploy     # wrangler deploy
```

Worker secrets are configured with `wrangler secret put`:

```bash
echo "$ELEVENLABS_API_KEY" | npx wrangler secret put ELEVENLABS_API_KEY
echo "$GITHUB_TOKEN" | npx wrangler secret put GITHUB_TOKEN
echo "$WEBHOOK_SECRET" | npx wrangler secret put WEBHOOK_SECRET
```

Plain-text bindings (`ELEVENLABS_AGENT_ID`, `GITHUB_REPO`, `BUILD_ID`) live in
`wrangler.jsonc` under `vars`.

## ElevenLabs workspace

Agent configuration lives in `agent/`:

- `agent/prompt.md` — system prompt and workflow orchestration.
- `agent/knowledge-base/` — checkout spec, severity/issue rubric, privacy
  policy.
- `agent/tools.json` — webhook tools (`github_duplicate_search`,
  `github_issue_create`) and client tools
  (`capture_browser_context`, `render_issue_preview`,
  `render_submission_result`).
- `agent/workflow.json` — workflow stages and post-call analysis fields
  (`outcome`, `issue_number`, `severity`, `duplicate_found`).
- `agent/export.json` — full agent export for the ElevenLabs CLI.

Dynamic variables used by the agent: `build_id`, `environment`, `repository`,
`report_session_id`.

## Testing

- `test/ui.test.tsx` — checkout render, seeded coupon failure, Bugline panel
  states.
- `test/unit.test.ts` — fingerprint stability, redaction, telemetry buffers.
- `test/worker.test.ts` — Worker endpoints via the Cloudflare Vitest plugin.
- Live smoke checks: create a draft through the Worker, confirm duplicate
  idempotency, close the rehearsal issue.

## Tradeoffs

Instrumentation is deliberately narrow. A single checkout flow with an
allowlist of fields is predictable and safe to run anonymously, unlike general
browser scraping. Fingerprint deduplication is content-based, not tracker-based,
so the same bug reported from different browsers still collapses into one
issue. The GitHub token is the highest-risk credential and is scoped to one
public demo repo.

## Not included

No screenshots, video, DOM dumps, request bodies, arbitrary website support,
persistent telemetry storage, multiple issue trackers, autonomous submission,
or AI-generated severity outside the explicit rubric.
