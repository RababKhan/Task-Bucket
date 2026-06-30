import { describe, it, expect } from "vitest";
import {
  isExpired,
  inviteAcceptError,
  diffProjectAccess,
  parseProjectAccess,
  INVITE_ERROR,
} from "@/lib/invites";

const NOW = Date.UTC(2026, 0, 15, 12, 0, 0); // fixed "now" for determinism

describe("isExpired", () => {
  it("treats a past timestamp as expired", () => {
    expect(isExpired("2026-01-10 00:00:00", NOW)).toBe(true);
  });
  it("treats a future timestamp as not expired", () => {
    expect(isExpired("2026-02-01 00:00:00", NOW)).toBe(false);
  });
  it("treats null as expired", () => {
    expect(isExpired(null, NOW)).toBe(true);
  });
});

describe("inviteAcceptError", () => {
  const future = "2026-02-01 00:00:00";
  const past = "2026-01-01 00:00:00";

  it("allows a valid pending, unexpired invite", () => {
    expect(inviteAcceptError({ status: "pending", expires_at: future }, NOW)).toBeNull();
  });
  it("rejects a cancelled invite", () => {
    expect(inviteAcceptError({ status: "cancelled", expires_at: future }, NOW)).toEqual(
      INVITE_ERROR.cancelled
    );
  });
  it("rejects an already-accepted invite", () => {
    expect(inviteAcceptError({ status: "accepted", expires_at: future }, NOW)).toEqual(
      INVITE_ERROR.accepted
    );
  });
  it("rejects an explicitly expired invite", () => {
    expect(inviteAcceptError({ status: "expired", expires_at: future }, NOW)).toEqual(
      INVITE_ERROR.expired
    );
  });
  it("rejects a pending invite whose expiry has passed", () => {
    expect(inviteAcceptError({ status: "pending", expires_at: past }, NOW)).toEqual(
      INVITE_ERROR.expired
    );
  });
});

describe("parseProjectAccess", () => {
  it("parses a JSON array of ids", () => {
    expect(parseProjectAccess("[1,2,3]")).toEqual([1, 2, 3]);
  });
  it("dedupes and drops non-numbers", () => {
    expect(parseProjectAccess('[1,1,2,"x"]')).toEqual([1, 2]);
  });
  it("returns [] for null/garbage", () => {
    expect(parseProjectAccess(null)).toEqual([]);
    expect(parseProjectAccess("not json")).toEqual([]);
  });
});

describe("diffProjectAccess", () => {
  it("computes adds and removes", () => {
    expect(diffProjectAccess([1, 2, 3], [2, 3, 4])).toEqual({
      add: [4],
      remove: [1],
    });
  });
  it("is a no-op when unchanged", () => {
    expect(diffProjectAccess([1, 2], [2, 1])).toEqual({ add: [], remove: [] });
  });
});
