import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Checkout } from "../src/components/Checkout";
import { TelemetryBuffer } from "../src/telemetry/telemetry";
import { BuglinePanel } from "../src/components/BuglinePanel";
import type { BrowserContext } from "../src/shared/contracts";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});


function makeContext(): BrowserContext {
  return {
    route: "/checkout",
    buildId: "build-1",
    browser: "chrome",
    viewport: "1440x900",
    actions: [],
    failedRequests: [],
    errors: [],
  };
}

describe("Checkout", () => {
  it("renders cart, fields, and summary", () => {
    const telemetry = new TelemetryBuffer("/checkout", "build-1");
    render(
      <Checkout telemetry={telemetry} onCouponApplied={() => undefined} onError={() => undefined} />,
    );
    expect(screen.getByText("Checkout")).toBeTruthy();
    expect(screen.getByLabelText("Promo code")).toBeTruthy();
    expect(screen.getByTestId("subtotal").textContent).toContain("139.00");
  });

  it("applies coupon and records failure", async () => {
    const telemetry = new TelemetryBuffer("/checkout", "build-1");
    const onCoupon = vi.fn();
    const onError = vi.fn();
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          ok: false,
          code: "PROMO_ENGINE_TIMEOUT",
          message: "timeout",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const { unmount } = render(
      <Checkout telemetry={telemetry} onCouponApplied={onCoupon} onError={onError} />,
    );
    await userEvent.click(screen.getByTestId("apply-coupon"));
    await screen.findByTestId("coupon-error");
    expect(onError).toHaveBeenCalled();
    expect(onCoupon).toHaveBeenCalled();
    expect(["PromoEngineError","FetchError"]).toContain(onError.mock.calls[0][0]);
    unmount();
  });
});

describe("BuglinePanel", () => {
  it("shows status, chips, preview, and result", () => {
    render(
      <BuglinePanel
        context={makeContext()}
        sessionId="rpt_abc123"
        status="connected"
        draftFields={{}}
        onApprove={() => undefined}
        hasDraft={false}
        preview={{
          title: "SAVE20 timeout",
          summary: "Coupon fails",
          actualBehavior: "error",
          expectedBehavior: "discount",
          reproductionSteps: ["Apply"],
          severity: "high",
          context: makeContext(),
          fingerprint: "f1234567",
          reportSessionId: "rpt_abc123",
        }}
        result={{ status: "created", number: 9, url: "https://github.com/x/9" }}
        onStartVoice={() => undefined}
        onEndVoice={() => undefined}
        onClear={() => undefined}
        isSpeaking={false}
      />,
    );
    expect(screen.getByTestId("voice-status").textContent).toContain("Listening");
    expect(screen.getByTestId("issue-preview").textContent).toContain("SAVE20 timeout");
    expect(screen.getByTestId("issue-result").textContent).toContain("Issue created");
  });

  it("renders preview safely when reproductionSteps is missing", () => {
    render(
      <BuglinePanel
        context={makeContext()}
        sessionId="rpt_abc123"
        status="connected"
        draftFields={{}}
        onApprove={() => undefined}
        hasDraft={false}
        preview={{
          title: "SAVE20 timeout",
          summary: "Coupon fails",
          actualBehavior: "error",
          expectedBehavior: "discount",
          reproductionSteps: undefined as unknown as string[],
          severity: "high",
          context: makeContext(),
          fingerprint: "f1234567",
          reportSessionId: "rpt_abc123",
        }}
        result={null}
        onStartVoice={() => undefined}
        onEndVoice={() => undefined}
        onClear={() => undefined}
        isSpeaking={false}
      />,
    );
    expect(screen.getByTestId("issue-preview").textContent).toContain("SAVE20 timeout");
    expect(screen.queryByTestId("issue-preview")?.textContent).toContain("Actual");
  });
});
