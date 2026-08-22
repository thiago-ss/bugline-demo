import { useCallback, useEffect, useRef } from "react";
import {
  ConversationProvider,
  useConversation,
  useConversationClientTool,
  useConversationControls,
  useConversationMode,
  useConversationStatus,
} from "@elevenlabs/react";
import type { BrowserContext, IssueDraft, IssueResult } from "../shared/contracts";
import { fingerprintDraft } from "../shared/fingerprint";
import type { TelemetryBuffer } from "../telemetry/telemetry";
import type { VoiceStatus } from "../components/BuglinePanel";

export type AgentApi = {
  status: VoiceStatus;
  isSpeaking: boolean;
  error?: string;
  start: () => Promise<void>;
  end: () => void;
  sendContext: (text: string) => void;
};

type RealAgentProps = {
  telemetry: TelemetryBuffer;
  sessionId: string;
  onContext: (context: BrowserContext) => void;
  onPreview: (draft: IssueDraft | null) => void;
  onResult: (result: IssueResult | null) => void;
  onStatus: (status: VoiceStatus, error?: string) => void;
  children: (api: AgentApi) => React.ReactNode;
};

function AgentInner({
  telemetry,
  sessionId,
  onContext,
  onPreview,
  onResult,
  onStatus,
  children,
}: RealAgentProps) {
  const { startSession, endSession, sendContextualUpdate } =
    useConversationControls();
  const { status: connectionStatus, message: connectionError } =
    useConversationStatus();
  const { isSpeaking } = useConversationMode();
  const latest = useRef({ onContext, onPreview, onResult });
  useEffect(() => {
    latest.current = { onContext, onPreview, onResult };
  }, [onContext, onPreview, onResult]);

  const handleStart = useCallback(async () => {
    const response = await fetch("/api/agent/session");
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      onStatus("error", body.error ?? "Could not start a voice session.");
      return;
    }
    const body = (await response.json()) as { signedUrl?: string };
    if (!body.signedUrl) {
      onStatus("error", "Voice session unavailable.");
      return;
    }
    startSession({ signedUrl: body.signedUrl });
  }, [startSession, onStatus]);

  const contextTool = useCallback(
    (): string => {
      const snapshot = telemetry.snapshot();
      latest.current.onContext(snapshot);
      return JSON.stringify(snapshot);
    },
    [telemetry],
  );

  const previewTool = useCallback(
    (params: { draft?: IssueDraft }): string => {
      if (!params.draft) {
        return JSON.stringify({ ok: false, rendered: false });
      }
      const draft: IssueDraft = {
        ...params.draft,
        context: telemetry.snapshot(),
        fingerprint: fingerprintDraft(params.draft),
        reportSessionId: params.draft.reportSessionId ?? "unknown",
      };
      latest.current.onPreview(draft);
      return JSON.stringify({ ok: true, rendered: true });
    },
    [telemetry],
  );

  const resultTool = useCallback(
    (params: { result?: IssueResult }): string => {
      if (!params.result) return JSON.stringify({ ok: false });
      latest.current.onResult(params.result);
      return JSON.stringify({ ok: true });
    },
    [],
  );

  useConversationClientTool("capture_browser_context", contextTool);
  useConversationClientTool("render_issue_preview", previewTool);
  useConversationClientTool("render_submission_result", resultTool);

  useConversation({
    clientTools: {
      capture_browser_context: contextTool,
      render_issue_preview: previewTool,
      render_submission_result: resultTool,
    },
    dynamicVariables: {
      report_session_id: sessionId,
    },
  });

  useEffect(() => {
    if (connectionStatus === "connecting") onStatus("connecting");
    if (connectionStatus === "connected") onStatus("connected");
    if (connectionStatus === "disconnected") onStatus("idle");
    if (connectionStatus === "error") onStatus("error", connectionError);
  }, [connectionStatus, connectionError, onStatus]);

  const api: AgentApi = {
    status:
      connectionStatus === "connected"
        ? "connected"
        : connectionStatus === "error"
          ? "error"
          : "idle",
    isSpeaking,
    error: connectionError,
    start: handleStart,
    end: endSession,
    sendContext: (text) => sendContextualUpdate(text),
  };

  return <>{children(api)}</>;
}

export function VoiceAgentProvider(props: RealAgentProps) {
  return (
    <ConversationProvider>
      <AgentInner {...props} />
    </ConversationProvider>
  );
}
