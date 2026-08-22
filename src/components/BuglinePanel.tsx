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
  draftFields: Record<string, string>;
  toolActivity?: string | null;
  duplicate?: { number: number; title: string; url: string } | null;
  result?: IssueResult | null;
  onApprove: () => void;
  hasDraft: boolean;
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
  draftFields,
  toolActivity,
  duplicate,
  result,
  onApprove,
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
          <span className="micro-label">Voice QA agent</span>
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
        {toolActivity && (
          <p className="tool-activity" data-testid="tool-activity" role="status">
            {toolActivity}
          </p>
        )}
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

      <section className="chip-panel" aria-label="Captured context">
        <h3 className="panel-title">Captured context</h3>
        {chipGroups.map((chip) => (
          <div className="chip" key={chip.label}>
            <span>{chip.label}</span>
            <strong>{chip.value}</strong>
          </div>
        ))}
      </section>

      {duplicate && (
        <section className="duplicate-note" data-testid="duplicate-note">
          <span className="micro-label">Existing issue found</span>
          <a href={duplicate.url} target="_blank" rel="noreferrer">
            #{duplicate.number} — {duplicate.title}
          </a>
        </section>
      )}

      {preview && (
        <section className="preview" data-testid="issue-preview">
          <div className="preview-head">
            <h3>Issue preview</h3>
            <span className={`severity severity-${preview.severity}`}>{preview.severity}</span>
          </div>
          <p className="preview-title">{preview.title}</p>
          <p className="preview-summary">{preview.summary}</p>
          <div className="preview-body">
            <p><strong>Actual</strong>{preview.actualBehavior}</p>
            <p><strong>Expected</strong>{preview.expectedBehavior}</p>
            <ol>
              {preview.reproductionSteps.map((step, index) => (
                <li key={index}>{step}</li>
              ))}
            </ol>
          </div>
          <button
            type="button"
            className="approve-button"
            data-testid="approve-issue"
            onClick={onApprove}
            aria-describedby="approve-hint"
          >
            Approve and file
          </button>
          <span id="approve-hint" className="approve-hint">
            Submits to GitHub. The agent waits for this before filing.
          </span>
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

      {draftFields && Object.keys(draftFields).length > 0 && !preview && (
        <section className="draft-stream" data-testid="draft-stream">
          <h3>Drafting issue</h3>
          {Object.entries(draftFields).map(([field, value]) => (
            <p key={field}>
              <span>{field}</span>
              <strong>{value}</strong>
            </p>
          ))}
        </section>
      )}

      {result && (
        <section className="result" data-testid="issue-result">
          {result.status === "created" && (
            <>
              <p className="result-title">Issue created</p>
              <a href={result.url} target="_blank" rel="noreferrer">
                Open #{result.number} on GitHub
              </a>
            </>
          )}
          {result.status === "duplicate" && (
            <>
              <p className="result-title">Existing issue</p>
              <a href={result.url} target="_blank" rel="noreferrer">
                Open #{result.number} on GitHub
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
