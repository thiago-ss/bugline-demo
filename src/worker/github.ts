import type {
  BrowserContext,
  DuplicateCandidate,
  IssueDraft,
  IssueResult,
  Severity,
} from "../shared/contracts";
import { fingerprintDraft, jaccard, tokenize } from "../shared/fingerprint";
import { redactObject } from "../shared/redact";

const FINGERPRINT_PREFIX = "bugline-fingerprint: ";

type GitHubIssue = {
  number: number;
  title: string;
  html_url: string;
  body?: string | null;
  labels?: Array<{ name: string }>;
};

function extractFingerprint(body: string | null | undefined): string | undefined {
  if (!body) return undefined;
  const match = body.match(
    new RegExp(`${FINGERPRINT_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\S+)`),
  );
  return match?.[1];
}

/** Exported for the worker's create path so idempotency pre-check reuses it. */
export function extractFingerprintFromBody(
  body: string | null | undefined,
): string | undefined {
  return extractFingerprint(body);
}

function queryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  return search.toString();
}

export async function fetchOpenBugIssues(
  token: string,
  repo: string,
): Promise<GitHubIssue[]> {
  const response = await fetch(
    `https://api.github.com/repos/${repo}/issues?${queryString({
      state: "open",
      labels: "bug",
      per_page: 100,
    })}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "bugline-demo-worker",
      },
    },
  );
  if (!response.ok) {
    throw new Error(`GitHub issues fetch failed (${response.status})`);
  }
  const issues = (await response.json()) as GitHubIssue[];
  // Filter out pull requests, which GitHub returns in the issues endpoint.
  return issues.filter((issue) => !issue.html_url.includes("/pull/"));
}

export function rankDuplicates(
  draft: Pick<IssueDraft, "title" | "summary"> & { fingerprint: string },
  issues: GitHubIssue[],
): DuplicateCandidate[] {
  const targetTokens = tokenize(`${draft.title} ${draft.summary}`);
  const ranked = issues
    .map((issue) => {
      const fingerprint = extractFingerprint(issue.body);
      let score = 0;
      if (fingerprint && fingerprint === draft.fingerprint) {
        score = 1;
      } else {
        const issueTokens = tokenize(
          `${issue.title} ${issue.body ?? ""}`.slice(0, 4000),
        );
        score = jaccard(targetTokens, issueTokens);
      }
      return {
        issue,
        score,
        fingerprint,
      };
    })
    .filter(({ score }) => score > 0.25)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  return ranked.map(({ issue, score, fingerprint }) => ({
    number: issue.number,
    title: issue.title,
    score: Math.round(score * 1000) / 1000,
    url: issue.html_url,
    fingerprint,
  }));
}

function markdownEscape(text: string): string {
  return text.replace(/[\\`*_{}[\]()#+\-.!>|~]/g, (char) => `\\${char}`);
}

export function formatIssueMarkdown(draft: IssueDraft): string {
  const context = draft.context;
  const steps = draft.reproductionSteps
    .map((step, index) => `${index + 1}. ${markdownEscape(step)}`)
    .join("\n");
  const actions = context.actions
    .map((action) => `- \`${markdownEscape(action.label)}\` at ${action.timestamp}`)
    .join("\n");
  const requests = context.failedRequests
    .map(
      (request) =>
        `- \`${request.method} ${markdownEscape(request.path)}\` → ${request.status} (${request.durationMs}ms)` +
        (request.traceId ? `, trace \`${request.traceId}\`` : ""),
    )
    .join("\n");
  const errors = context.errors
    .map((error) => `- \`${markdownEscape(error.name)}\`: ${markdownEscape(error.message)}`)
    .join("\n");

  return [
    "## Summary",
    "",
    markdownEscape(draft.summary),
    "",
    "## Actual",
    "",
    markdownEscape(draft.actualBehavior),
    "",
    "## Expected",
    "",
    markdownEscape(draft.expectedBehavior),
    "",
    "## Reproduction",
    "",
    steps,
    "",
    "## Environment",
    "",
    `- Route: \`${markdownEscape(context.route)}\``,
    `- Build: \`${markdownEscape(context.buildId)}\``,
    `- Browser: \`${markdownEscape(context.browser)}\``,
    `- Viewport: \`${markdownEscape(context.viewport)}\``,
    `- Severity: ${draft.severity}`,
    "",
    "## Evidence",
    "",
    "### Recent actions",
    "",
    actions || "- none",
    "",
    "### Failed requests",
    "",
    requests || "- none",
    "",
    "### Errors",
    "",
    errors || "- none",
    "",
    `Report session: \`${markdownEscape(draft.reportSessionId)}\``,
    "",
    `${FINGERPRINT_PREFIX}${draft.fingerprint}`,
  ].join("\n");
}

export function issueLabels(severity: Severity): string[] {
  return ["bug", "agent-generated", `severity:${severity}`];
}

export async function createGitHubIssue(
  token: string,
  repo: string,
  draft: IssueDraft,
): Promise<IssueResult> {
  const response = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      "User-Agent": "bugline-demo-worker",
    },
    body: JSON.stringify({
      title: draft.title.slice(0, 180),
      body: formatIssueMarkdown(draft),
      labels: issueLabels(draft.severity),
    }),
  });

  if (response.status === 422) {
    // Idempotency guard on the server: a matching open issue already exists.
    const existing = await fetchOpenBugIssues(token, repo);
    const duplicate = existing.find(
      (issue) => extractFingerprint(issue.body) === draft.fingerprint,
    );
    if (duplicate) {
      return {
        status: "duplicate",
        number: duplicate.number,
        url: duplicate.html_url,
      };
    }
  }

  if (!response.ok) {
    const retryable = response.status >= 500 || response.status === 429;
    return {
      status: "failed",
      retryable,
      message: `GitHub rejected the issue (${response.status})`,
    };
  }

  const created = (await response.json()) as GitHubIssue;
  return {
    status: "created",
    number: created.number,
    url: created.html_url,
  };
}

export function validateAndRedactDraft(raw: unknown): IssueDraft | null {
  const draft = raw as Partial<IssueDraft>;
  if (
    typeof draft.title !== "string" ||
    typeof draft.summary !== "string" ||
    typeof draft.actualBehavior !== "string" ||
    typeof draft.expectedBehavior !== "string" ||
    !Array.isArray(draft.reproductionSteps) ||
    !draft.reproductionSteps.every((step) => typeof step === "string") ||
    (draft.severity !== "low" &&
      draft.severity !== "medium" &&
      draft.severity !== "high") ||
    typeof draft.fingerprint !== "string" ||
    typeof draft.reportSessionId !== "string" ||
    !draft.context
  ) {
    return null;
  }

  const cleaned: IssueDraft = {
    title: draft.title.trim().slice(0, 180),
    summary: draft.summary.trim().slice(0, 2000),
    actualBehavior: draft.actualBehavior.trim().slice(0, 2000),
    expectedBehavior: draft.expectedBehavior.trim().slice(0, 2000),
    reproductionSteps: draft.reproductionSteps
      .map((step) => String(step).trim().slice(0, 500))
      .filter(Boolean)
      .slice(0, 12),
    severity: draft.severity,
    context: redactObject(draft.context) as BrowserContext,
    fingerprint: draft.fingerprint,
    reportSessionId: draft.reportSessionId.slice(0, 120),
  };

  if (cleaned.title.length < 5 || cleaned.reproductionSteps.length === 0) {
    return null;
  }

  const recomputed = fingerprintDraft(cleaned);
  if (recomputed !== cleaned.fingerprint) {
    return null;
  }
  return cleaned;
}
