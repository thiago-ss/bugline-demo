import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ConversationProvider,
  useConversation,
  useConversationClientTool,
  useConversationControls,
  useConversationMode,
  useConversationStatus,
} from "@elevenlabs/react";
import type {
  BrowserContext,
  IssueDraft,
  IssueResult,
} from "../shared/contracts";
import { fingerprintDraft } from "../shared/fingerprint";
import type { TelemetryBuffer } from "../telemetry/telemetry";
import type { VoiceStatus } from "../components/BuglinePanel";

export type AgentApi = {
  status: VoiceStatus;
  isSpeaking: boolean;
  isActive: boolean;
  error?: string;
  start: () => Promise<void>;
  end: () => void;
  sendContext: (text: string) => void;
  approve: () => void;
  hasDraft: boolean;
};

type RealAgentProps = {
  telemetry: TelemetryBuffer;
  sessionId: string;
  onContext: (context: BrowserContext) => void;
  onPreview: (draft: IssueDraft | null) => void;
  onDraftStream: (field: string, value: string) => void;
  onToolActivity: (toolName: string, params: Record<string, unknown> | null) => void;
  onResult: (result: IssueResult | null) => void;
  onStatus: (status: VoiceStatus, error?: string) => void;
  approveSessionActive?: boolean;
  onUserInterject?: (text: string) => void;
  children: (api: AgentApi) => React.ReactNode;
};

function AgentInner({
  telemetry,
  sessionId,
  onContext,
  onPreview,
  onDraftStream,
  onToolActivity,
  onResult,
  onStatus,
  onUserInterject,
  children,
}: RealAgentProps) {
  const { startSession, endSession, sendUserMessage } =
    useConversationControls();
  const { status: connectionStatus, message: connectionError } =
    useConversationStatus();
  const { isSpeaking } = useConversationMode();
  const isActive = connectionStatus === "connected";
  const latest = useRef<RealAgentProps | null>(null);
  // Intentional latest-ref pattern, same as ConversationProvider's
  // defaultOptionsRef, so tool callbacks always see fresh handlers.
  // eslint-disable-next-line react-hooks/refs
  useEffect(() => {
    latest.current = {
      telemetry,
      sessionId,
      onContext,
      onPreview,
      onDraftStream,
      onToolActivity,
      onResult,
      onStatus,
      approveSessionActive: isActive,
      onUserInterject,
      children,
    };
  });

  const [drafting, setDrafting] = useState(false);

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
      latest.current!.onContext(snapshot);
      latest.current!.onToolActivity("capture_browser_context", null);
      return JSON.stringify(snapshot);
    },
    [telemetry],
  );

  const previewTool = useCallback(
    (params: { draft?: IssueDraft }): string => {
      if (!params.draft) {
        return JSON.stringify({ ok: false, rendered: false });
      }
      setDrafting(false);
      latest.current!.onToolActivity("render_issue_preview", null);
      const raw = params.draft as Partial<IssueDraft>;
      const normalized = {
        title: String(raw.title ?? ""),
        summary: String(raw.summary ?? ""),
        actualBehavior: String(raw.actualBehavior ?? ""),
        expectedBehavior: String(raw.expectedBehavior ?? ""),
        reproductionSteps: Array.isArray(raw.reproductionSteps)
          ? raw.reproductionSteps.map((step) => String(step)).filter(Boolean)
          : [],
        severity:
          raw.severity === "low" ||
          raw.severity === "medium" ||
          raw.severity === "high"
            ? raw.severity
            : "medium",
      };
      const draft: IssueDraft = {
        ...normalized,
        context: telemetry.snapshot(),
        fingerprint: fingerprintDraft(normalized),
        reportSessionId: String(raw.reportSessionId ?? "unknown"),
      };
      latest.current!.onPreview(draft);
      return JSON.stringify({
        ok: true,
        rendered: true,
        approved: false,
        message: "Preview rendered. Waiting for tester approval.",
      });
    },
    [telemetry],
  );

  const streamTool = useCallback(
    (params: { field?: string; value?: string }): string => {
      const field = params.field ?? "";
      const value = params.value ?? "";
      if (!field) return JSON.stringify({ ok: false, error: "field required" });
      setDrafting(true);
      latest.current!.onToolActivity("stream_draft", { field });
      latest.current!.onDraftStream(field, value);
      return JSON.stringify({ ok: true });
    },
    [],
  );

  const approveTool = useCallback((): string => {
    latest.current?.onToolActivity("approve_draft", null);
    if (latest.current?.approveSessionActive) {
      sendUserMessage("Approved. File the issue now.");
    }
    return JSON.stringify({
      ok: true,
      approved: true,
      message:
        "Approval sent to the agent. It should call github_issue_create now.",
    });
  }, [sendUserMessage]);

  const resultTool = useCallback(
    (params: { result?: IssueResult }): string => {
      if (!params.result) return JSON.stringify({ ok: false });
      setDrafting(false);
      latest.current?.onToolActivity("render_submission_result", null);
      latest.current?.onResult(params.result);
      return JSON.stringify({ ok: true });
    },
    [],
  );

  const userInterjectTool = useCallback(
    (params: { text?: string }): string => {
      const text = String(params.text ?? "").trim();
      if (!text) return JSON.stringify({ ok: false, error: "text required" });
      latest.current?.onUserInterject?.(text);
      return JSON.stringify({ ok: true });
    },
    [],
  );

  useEffect(() => {
      latest.current?.onToolActivity("__status__", {
      status: connectionStatus,
      speaking: isSpeaking,
      drafting,
    });
  }, [connectionStatus, isSpeaking, drafting]);

  useConversationClientTool("capture_browser_context", contextTool);
  useConversationClientTool("render_issue_preview", previewTool);
  useConversationClientTool("stream_draft", streamTool);
  useConversationClientTool("approve_draft", approveTool);
  useConversationClientTool("user_interject", userInterjectTool);
  useConversationClientTool("render_submission_result", resultTool);

  useConversation({
    clientTools: {
      capture_browser_context: contextTool,
      render_issue_preview: previewTool,
      stream_draft: streamTool,
      approve_draft: approveTool,
      user_interject: userInterjectTool,
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

  const api: AgentApi = useMemo<AgentApi>(() => ({
    status:
      connectionStatus === "connected"
        ? "connected"
        : connectionStatus === "error"
          ? "error"
          : "idle",
    isSpeaking,
    isActive,
    error: connectionError,
    start: handleStart,
    end: endSession,
    sendContext: (text) => sendUserMessage(text),
    approve: approveTool,
    hasDraft: true,
  }), [connectionStatus, isSpeaking, isActive, connectionError, handleStart, endSession, sendUserMessage, approveTool]);

  return (
    <>
      {/* Render-prop call; ref access happens only inside tool handlers. */}
      {/* eslint-disable-next-line react-hooks/refs */}
      {children(api)}
    </>
  );
}

export function VoiceAgentProvider(props: RealAgentProps) {
  return (
    <ConversationProvider>
      <AgentInner {...props} />
    </ConversationProvider>
  );
}
