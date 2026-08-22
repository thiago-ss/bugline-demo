import { describe, expect, it } from "vitest";
import {
  formatIssueMarkdown,
  rankDuplicates,
  validateAndRedactDraft,
} from "../src/worker/github";
import { fingerprintDraft } from "../src/shared/fingerprint";
import type { IssueDraft } from "../src/shared/contracts";

const baseDraft = {
  title: "SAVE20 promo engine times out at checkout",
  summary: "Applying SAVE20 on a cart over $50 returns PROMO_ENGINE_TIMEOUT.",
  actualBehavior: "Checkout shows an error and the order cannot be placed.",
  expectedBehavior: "SAVE20 applies 20% off when the cart subtotal exceeds $50.",
  reproductionSteps: ["Add the keyboard to the cart", "Apply SAVE20", "Observe the error"],
  severity: "high" as const,
  context: {
    route: "/checkout",
    buildId: "b1",
    browser: "chrome",
    viewport: "1440x900",
    actions: [],
    failedRequests: [],
    errors: [],
  },
  reportSessionId: "rpt_unit",
};

describe("github helpers", () => {
  it("ranks exact fingerprint matches first", () => {
    const fingerprint = fingerprintDraft(baseDraft);
    const issues = [
      {
        number: 1,
        title: "Something unrelated",
        html_url: "https://github.com/x/1",
        body: "whatever",
        labels: [],
      },
      {
        number: 2,
        title: "SAVE20 promo engine times out at checkout",
        html_url: "https://github.com/x/2",
        body: `bugline-fingerprint: ${fingerprint}`,
        labels: [],
      },
    ];
    const ranked = rankDuplicates(
      { ...baseDraft, fingerprint },
      issues as never,
    );
    expect(ranked[0].number).toBe(2);
    expect(ranked[0].score).toBe(1);
  });

  it("ranks similar titles by jaccard similarity", () => {
    const fingerprint = fingerprintDraft(baseDraft);
    const issues = [
      {
        number: 3,
        title: "SAVE20 coupon times out during checkout",
        html_url: "https://github.com/x/3",
        body: "Applies SAVE20 and checkout fails with a timeout.",
        labels: [],
      },
      {
        number: 4,
        title: "Fix typo in README",
        html_url: "https://github.com/x/4",
        body: "no relation",
        labels: [],
      },
    ];
    const ranked = rankDuplicates(
      { ...baseDraft, fingerprint },
      issues as never,
    );
    expect(ranked[0].number).toBe(3);
    expect(ranked.length).toBe(1);
  });

  it("formats markdown with summary, actual, expected, repro, environment, evidence, session, and fingerprint", () => {
    const draft: IssueDraft = {
      ...baseDraft,
      context: {
        ...baseDraft.context,
        actions: [{ label: "Clicked Apply", timestamp: "2026-01-01T00:00:00Z" }],
        failedRequests: [
          { method: "POST", path: "/api/demo/apply-coupon", status: 500, durationMs: 2002 },
        ],
        errors: [{ name: "PromoEngineError", message: "timeout" }],
      },
      fingerprint: "f1234567",
    };
    const markdown = formatIssueMarkdown(draft);
    expect(markdown).toContain("## Summary");
    expect(markdown).toContain("## Actual");
    expect(markdown).toContain("## Expected");
    expect(markdown).toContain("## Reproduction");
    expect(markdown).toContain("## Environment");
    expect(markdown).toContain("## Evidence");
    expect(markdown).toContain("Report session: `rpt\\_unit`");
    expect(markdown).toContain("bugline-fingerprint: f1234567");
    expect(markdown).toContain("/api/demo/apply\\-coupon");
  });

  it("rejects drafts whose fingerprint does not match recomputation", () => {
    const draft = {
      ...baseDraft,
      fingerprint: "f0000000",
    };
    const cleaned = validateAndRedactDraft(draft);
    expect(cleaned).not.toBeNull();
    expect(cleaned!.fingerprint).not.toBe("f0000000");
  });

  it("redacts sensitive values inside a valid draft", () => {
    const draft = {
      ...baseDraft,
      summary: "Contact qa.tester@example.com token ghp_abcdefghijklmnopqrstuvwxyz123456",
      context: {
        ...baseDraft.context,
        route: "/checkout?token=abc123",
      },
      fingerprint: fingerprintDraft({
        ...baseDraft,
        summary:
          "Contact qa.tester@example.com token ghp_abcdefghijklmnopqrstuvwxyz123456",
      }),
    };
    const cleaned = validateAndRedactDraft(draft);
    expect(cleaned).not.toBeNull();
    expect(cleaned!.summary).toContain("[email-redacted]");
    expect(cleaned!.summary).toContain("[token-redacted]");
    expect(cleaned!.context.route).toBe("/checkout");
  });

  it("rejects drafts with empty environment fields", () => {
    const draft = {
      ...baseDraft,
      context: {
        route: "",
        buildId: "",
        browser: "",
        viewport: "",
        actions: [],
        failedRequests: [],
        errors: [],
      },
    };
    const cleaned = validateAndRedactDraft(draft);
    expect(cleaned).toBeNull();
  });
});
