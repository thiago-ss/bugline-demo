# Diagnostic Privacy and Redaction Policy

## What is captured

The browser captures an allowlist of fields only:

- Route, build ID, browser family, viewport.
- Last 10 user actions (label + timestamp).
- Last 5 failed requests (method, pathname, status, duration, trace ID).
- Last 5 errors (name, message).

## What is never captured

- Cookies, storage, headers, request bodies, form values.
- Screenshots, video, DOM dumps, or full page content.
- Full transcripts, passwords, tokens, card numbers, or full email addresses.

## Redaction rules

Redaction runs twice: in the browser before anything leaves, and on the Worker
before anything is persisted. It replaces:

- Emails with `[email-redacted]`.
- Token-like strings with `[token-redacted]`.
- Card-like numbers with `[card-redacted]`.
- Query strings with nothing (stripped).
- Long opaque strings with `[id-redacted]`.

## Agent rules

- Never ask for or repeat passwords, tokens, card numbers, or full emails.
- Never output raw header values, request bodies, cookies, or storage.
- Never include sensitive values in tool parameters. Exclude them from the
  draft and from `github_issue_create` payloads.
- Treat spoken sensitive values as excluded from the report, not as data to
  preserve.

## Sessions

- Every report is tied to a `reportSessionId`.
- No persistent telemetry database exists. Evidence lives only in the issue
  body and the ElevenLabs conversation transcript.
