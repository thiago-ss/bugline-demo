import { describe, expect, it } from "vitest";
import { redact, redactObject } from "../src/shared/redact";

describe("redact", () => {
  it("removes emails", () => {
    expect(redact("contact qa.tester@example.com now")).toContain("[email-redacted]");
    expect(redact("contact qa.tester@example.com now")).not.toContain("qa.tester");
  });

  it("removes API tokens", () => {
    const token = "ghp_abcdefghijklmnopqrstuvwxyz123456";
    expect(redact(`token=${token}`)).toContain("[token-redacted]");
    expect(redact(`token=${token}`)).not.toContain(token);
  });

  it("removes card-like numbers", () => {
    const card = "4242424242424242";
    expect(redact(`card ${card}`)).toContain("[card-redacted]");
    expect(redact(`card ${card}`)).not.toContain(card);
  });

  it("strips query strings", () => {
    expect(redact("/path?secret=abc&token=xyz")).toBe("/path");
  });

  it("removes long opaque ids", () => {
    const id = "0123456789abcdef0123456789abcdef";
    expect(redact(`trace ${id}`)).toContain("[id-redacted]");
  });
});

describe("redactObject", () => {
  it("redacts nested strings", () => {
    const input = {
      user: "qa.tester@example.com",
      meta: { token: "ghp_abcdefghijklmnopqrstuvwxyz123456" },
      list: ["keep", "secret@example.com"],
      count: 3,
    };
    const out = redactObject(input);
    expect(out.user).toContain("[email-redacted]");
    expect(out.meta.token).toContain("[token-redacted]");
    expect(out.list[1]).toContain("[email-redacted]");
    expect(out.list[0]).toBe("keep");
    expect(out.count).toBe(3);
  });
});
