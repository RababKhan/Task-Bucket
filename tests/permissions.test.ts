import { describe, it, expect } from "vitest";
import {
  MODULES,
  DEFAULT_PERMISSIONS,
  VALID_ACTIONS,
  ALL_PERM_KEYS,
  isValidPermission,
  parsePermKey,
  permKey,
  isSystemRoleKey,
  allPermissionPairs,
} from "@/lib/permissions";

describe("permission catalog", () => {
  it("includes the team_member module and not the retired members module", () => {
    expect(MODULES).toContain("team_member");
    expect(MODULES).not.toContain("members");
  });

  it("only lists valid (module, action) pairs in VALID_ACTIONS", () => {
    for (const m of MODULES) {
      for (const a of VALID_ACTIONS[m]) {
        expect(isValidPermission(m, a)).toBe(true);
      }
    }
  });

  it("admin default grants every valid permission", () => {
    expect(DEFAULT_PERMISSIONS.admin.length).toBe(ALL_PERM_KEYS.length);
    expect(allPermissionPairs().length).toBe(ALL_PERM_KEYS.length);
  });

  it("every manager + member default grant is a valid permission", () => {
    for (const role of ["manager", "assignee"] as const) {
      for (const [m, a] of DEFAULT_PERMISSIONS[role]) {
        expect(isValidPermission(m, a)).toBe(true);
      }
    }
  });

  it("manager can invite but cannot remove or update roles by default", () => {
    const set = new Set(DEFAULT_PERMISSIONS.manager.map(([m, a]) => permKey(m, a)));
    expect(set.has("team_member:invite")).toBe(true);
    expect(set.has("team_member:update_project_access")).toBe(true);
    expect(set.has("team_member:remove")).toBe(false);
    expect(set.has("team_member:update_role")).toBe(false);
    expect(set.has("team_member:deactivate")).toBe(false);
  });

  it("member (assignee) gets view-only team access by default", () => {
    const set = new Set(DEFAULT_PERMISSIONS.assignee.map(([m, a]) => permKey(m, a)));
    expect(set.has("team_member:view")).toBe(true);
    expect(set.has("team_member:invite")).toBe(false);
    expect(set.has("team_member:remove")).toBe(false);
  });

  it("parsePermKey accepts valid keys and rejects invalid ones", () => {
    expect(parsePermKey("team_member:invite")).toEqual(["team_member", "invite"]);
    expect(parsePermKey("team_member:nope")).toBeNull();
    expect(parsePermKey("bogus:view")).toBeNull();
    expect(parsePermKey("dashboard:delete")).toBeNull(); // dashboard only has view
  });

  it("identifies system role keys", () => {
    expect(isSystemRoleKey("admin")).toBe(true);
    expect(isSystemRoleKey("manager")).toBe(true);
    expect(isSystemRoleKey("assignee")).toBe(true);
    expect(isSystemRoleKey("qa_reviewer")).toBe(false);
  });
});
