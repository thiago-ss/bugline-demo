import { useMemo, useState } from "react";
import { BuglinePanel } from "./components/BuglinePanel";
import type { VoiceStatus } from "./components/BuglinePanel";
import { Checkout } from "./components/Checkout";
import { VoiceAgentProvider } from "./hooks/useVoiceAgent";
import type { BrowserContext, IssueDraft, IssueResult } from "./shared/contracts";
import { TelemetryBuffer } from "./telemetry/telemetry";
import "./App.css";

const BUILD_ID = "2026.08.22-staging-a7f3";

function AppShell() {
  const telemetry = useMemo(
    () => new TelemetryBuffer(window.location.pathname, BUILD_ID),
    [],
  );
  const [sessionId] = useState(() => `rpt_${Math.random().toString(36).slice(2, 10)}`);
  const [context, setContext] = useState<BrowserContext>(() => telemetry.snapshot());
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [voiceError, setVoiceError] = useState<string>();
  const [preview, setPreview] = useState<IssueDraft | null>(null);
  const [draftFields, setDraftFields] = useState<Record<string, string>>({});
  const [result, setResult] = useState<IssueResult | null>(null);
  const [toolActivity, setToolActivity] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<{
    number: number;
    title: string;
    url: string;
  } | null>(null);
  const [activity, setActivity] = useState<string[]>([]);

  function handleCoupon(summary: string) {
    setActivity((current) => [...current.slice(-4), summary]);
    setContext(telemetry.snapshot());
  }

  function handleError(name: string, message: string) {
    telemetry.trackError({ name, message });
    setContext(telemetry.snapshot());
  }

  function clearAll() {
    telemetry.reset();
    setContext(telemetry.snapshot());
    setPreview(null);
    setDraftFields({});
    setResult(null);
    setToolActivity(null);
    setRenderError(null);
    setDuplicate(null);
    setActivity([]);
  }

  return (
    <VoiceAgentProvider
      telemetry={telemetry}
      sessionId={sessionId}
      onContext={(next) => setContext(next)}
      onPreview={setPreview}
      onDraftStream={(field, value) =>
        setDraftFields((current) => ({ ...current, [field]: value }))
      }
      onToolActivity={(toolName) => {
        if (toolName === "__status__") return;
        if (toolName === "approve_draft") {
          setToolActivity("Approved. Filing the issue on GitHub.");
          return;
        }
        if (toolName === "render_issue_preview") {
          setToolActivity("Reviewing the draft with you.");
          return;
        }
        if (toolName === "stream_draft") {
          setToolActivity("Drafting the issue in real time.");
          return;
        }
        setToolActivity(
          toolName === "capture_browser_context"
            ? "Collecting sanitized browser context."
            : "Updating the panel.",
        );
      }}
      onResult={setResult}
      onStatus={(next, message) => {
        setStatus(next);
        setVoiceError(message);
      }}
    >
      {(api) => {
        if (renderError) {
          return (
            <div className="stage" role="alert">
              <h1>Bugline hit a rendering error</h1>
              <p className="muted">{renderError}</p>
              <button type="button" className="apply-button" onClick={clearAll}>
                Reset panel
              </button>
            </div>
          );
        }
        return (
          <div className="app">
            <BuglinePanel
              context={context}
              sessionId={sessionId}
              status={status}
              error={voiceError}
              preview={preview}
              draftFields={draftFields}
              toolActivity={toolActivity}
              duplicate={duplicate}
              result={result}
              onStartVoice={api.start}
              onEndVoice={api.end}
              onClear={clearAll}
              isSpeaking={api.isSpeaking}
              onApprove={api.approve}
              hasDraft={api.hasDraft}
            />
            <div className="stage">
              <Checkout
                telemetry={telemetry}
                onCouponApplied={handleCoupon}
                onError={handleError}
              />
              <section className="activity" aria-label="Session activity">
                <h2>Session activity</h2>
                {activity.length === 0 ? (
                  <p className="muted">
                    No events yet. Apply the SAVE20 coupon to reproduce the seeded failure.
                  </p>
                ) : (
                  <ul>
                    {activity.map((line, index) => (
                      <li key={`${index}-${line}`}>{line}</li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>
        );
      }}
    </VoiceAgentProvider>
  );
}

export default function App() {
  return <AppShell />;
}
