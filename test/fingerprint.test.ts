import { describe, expect, it } from "vitest";
import { fingerprintDraft, jaccard, normalizeText, tokenize } from "../src/shared/fingerprint";

const base = {
  title: "SAVE20 promo engine times out at checkout",
  summary: "Applying SAVE20 on a cart over $50 returns PROMO_ENGINE_TIMEOUT.",
  actualBehavior: "Checkout shows an error and the order cannot be placed.",
  expectedBehavior: "SAVE20 applies 20% off when the cart subtotal exceeds $50.",
  reproductionSteps: ["Add the keyboard to the cart", "Apply SAVE20", "Observe the error"],
};

describe("fingerprintDraft", () => {
  it("is stable for identical drafts", () => {
    expect(fingerprintDraft(base)).toBe(fingerprintDraft({ ...base }));
  });

  it("ignores case and punctuation", () => {
    const noisy = {
      ...base,
      title: "SAVE20 Promo Engine TIMES OUT at Checkout!",
      reproductionSteps: ["Add the keyboard to the cart.", "Apply SAVE20!", "Observe the error"],
    };
    expect(fingerprintDraft(noisy)).toBe(fingerprintDraft(base));
  });

  it("changes when semantic content changes", () => {
    const different = {
      ...base,
      expectedBehavior: "SAVE20 applies 10% off instead.",
    };
    expect(fingerprintDraft(different)).not.toBe(fingerprintDraft(base));
  });
});

describe("similarity helpers", () => {
  it("normalizes stop words", () => {
    expect(normalizeText("The bug in the cart")).toBe("bug cart");
  });

  it("computes jaccard similarity", () => {
    expect(jaccard(["a", "b"], ["a", "b"])).toBe(1);
    expect(jaccard(["a"], ["b"])).toBe(0);
    expect(jaccard([], [])).toBe(1);
  });

  it("tokenizes into normalized tokens", () => {
    expect(tokenize("SAVE20 promo ENGINE!")).toEqual(["save20", "promo", "engine"]);
  });
});
