export type Severity = "low" | "medium" | "high";

export type BrowserContext = {
  route: string;
  buildId: string;
  browser: string;
  viewport: string;
  actions: Array<{ label: string; timestamp: string }>;
  failedRequests: Array<{
    method: string;
    path: string;
    status: number;
    durationMs: number;
    traceId?: string;
  }>;
  errors: Array<{ name: string; message: string }>;
};

export type IssueDraft = {
  title: string;
  summary: string;
  actualBehavior: string;
  expectedBehavior: string;
  reproductionSteps: string[];
  severity: Severity;
  context: BrowserContext;
  fingerprint: string;
  reportSessionId: string;
};

export type IssueResult =
  | { status: "created"; number: number; url: string }
  | { status: "duplicate"; number: number; url: string }
  | { status: "failed"; retryable: boolean; message: string };

export type DuplicateCandidate = {
  number: number;
  title: string;
  score: number;
  url: string;
  fingerprint?: string;
};

export type SearchIssuesRequest = {
  fingerprint: string;
  title: string;
  summary: string;
  severity: Severity;
};

export type SearchIssuesResponse = {
  candidates: DuplicateCandidate[];
};

export type CreateIssueRequest = {
  draft: IssueDraft;
};

export type CreateIssueResponse = {
  result: IssueResult;
};

export type SessionResponse = {
  signedUrl?: string;
  conversationToken?: string;
  mode: "voice" | "text";
  agentId?: string;
  error?: string;
};
