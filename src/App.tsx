import { useMemo, useState } from "react";
import { BuglinePanel } from "./components/BuglinePanel";
import type { VoiceStatus } from "./components/BuglinePanel";
import { Checkout } from "./components/Checkout";
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
  const [voiceError] = useState<string>();
  const [preview, setPreview] = useState<IssueDraft | null>(null);
  const [result, setResult] = useState<IssueResult | null>(null);
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
    setResult(null);
    setDuplicate(null);
    setActivity([]);
  }

  return (
    <div className="app">
      <BuglinePanel
        context={context}
        sessionId={sessionId}
        status={status}
        error={voiceError}
        preview={preview}
        duplicate={duplicate}
        result={result}
        onStartVoice={() => setStatus("connecting")}
        onEndVoice={() => setStatus("idle")}
        onClear={clearAll}
        isSpeaking={false}
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
            <p className="muted">No events yet. Apply the SAVE20 coupon to reproduce the seeded failure.</p>
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
}

export default function App() {
  return <AppShell />;
}
