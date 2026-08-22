import { useEffect, useState } from "react";
import type { BrowserContext, IssueDraft, IssueResult } from "../shared/contracts";
import { fingerprintDraft } from "../shared/fingerprint";

export type VoiceStatus = "idle" | "connecting" | "connected" | "speaking" | "error";

type BuglinePanelProps = {
  context: BrowserContext;
  sessionId: string;
  status: VoiceStatus;
  error?: string;
  preview?: IssueDraft | null;
  duplicate?: { number: number; title: string; url: string } | null;
  result?: IssueResult | null;
  onStartVoice: () => void;
  onEndVoice: () => void;
  onClear: () => void;
  isSpeaking: boolean;
};

export function BuglinePanel({
  context,
  sessionId,
  status,
  error,
  preview,
  duplicate,
  result,
  onStartVoice,
  onEndVoice,
  onClear,
  isSpeaking,
}: BuglinePanelProps) {
  const [copied, setCopied] = useState(false);
  const fingerprint = fingerprintDraft({
    title: preview?.title ?? "",
    summary: preview?.summary ?? "",
    actualBehavior: preview?.actualBehavior ?? "",
    expectedBehavior: preview?.expectedBehavior ?? "",
    reproductionSteps: preview?.reproductionSteps ?? [],
  });

  useEffect(() => {
    if (!copied) return;
    const timeout = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timeout);
  }, [copied]);

  const chipGroups = [
    { label: "Route", value: context.route },
    { label: "Build", value: context.buildId },
    { label: "Browser", value: context.browser },
    { label: "Viewport", value: context.viewport },
    { label: "Actions", value: String(context.actions.length) },
    { label: "Failed", value: String(context.failedRequests.length) },
    { label: "Errors", value: String(context.errors.length) },
  ];

  return (
    <aside className="bugline" data-testid="bugline">
      <header className="bugline-header">
        <div>
          <span className="eyebrow">Voice QA agent</span>
          <h2>Bugline</h2>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Clear captured context"
          onClick={onClear}
          title="Clear context"
        >
          ×
        </button>
      </header>

      <section className="voice-card" aria-label="Voice session">
        <div className={`voice-indicator voice-${status}`}>
          <span className="voice-dot" />
          <span data-testid="voice-status">{statusLabel(status, isSpeaking)}</span>
        </div>
        {status === "idle" ? (
          <button type="button" className="voice-button" onClick={onStartVoice}>
            Start voice session
          </button>
        ) : (
          <button type="button" className="voice-button secondary" onClick={onEndVoice}>
            End session
          </button>
        )}
        {error && <p className="voice-error" role="alert">{error}</p>}
        <p className="session-line">Session {sessionId.slice(0, 12)}</p>
      </section>

      <section className="chips" aria-label="Captured context">
        {chipGroups.map((chip) => (
          <div className="chip" key={chip.label}>
            <span>{chip.label}</span>
            <strong>{chip.value}</strong>
          </div>
        ))}
      </section>

      {duplicate && (
        <section className="duplicate-note" data-testid="duplicate-note">
          <span>Existing issue found</span>
          <a href={duplicate.url} target="_blank" rel="noreferrer">
            #{duplicate.number} — {duplicate.title}
          </a>
        </section>
      )}

      {preview && (
        <section className="preview" data-testid="issue-preview">
          <div className="preview-head">
            <h3>Issue preview</h3>
            <span className="severity severity-{preview.severity}">{preview.severity}</span>
          </div>
          <p className="preview-title">{preview.title}</p>
          <p className="preview-summary">{preview.summary}</p>
          <button
            type="button"
            className="copy-button"
            onClick={() => {
              void navigator.clipboard?.writeText(fingerprint);
              setCopied(true);
            }}
          >
            {copied ? "Copied" : "Copy fingerprint"}
          </button>
        </section>
      )}

      {result && (
        <section className="result" data-testid="issue-result">
          {result.status === "created" && (
            <>
              <p className="result-title">Issue created</p>
              <a href={result.url} target="_blank" rel="noreferrer">
                #{result.number} on GitHub
              </a>
            </>
          )}
          {result.status === "duplicate" && (
            <>
              <p className="result-title">Existing issue</p>
              <a href={result.url} target="_blank" rel="noreferrer">
                #{result.number} on GitHub
              </a>
            </>
          )}
          {result.status === "failed" && (
            <>
              <p className="result-title">Submission failed</p>
              <p className="result-error">{result.message}</p>
            </>
          )}
        </section>
      )}
    </aside>
  );
}

function statusLabel(status: VoiceStatus, isSpeaking: boolean): string {
  if (status === "connected" && isSpeaking) return "Agent speaking";
  switch (status) {
    case "idle":
      return "Ready";
    case "connecting":
      return "Connecting";
    case "connected":
      return "Listening";
    case "error":
      return "Session error";
    default:
      return status;
  }
}
