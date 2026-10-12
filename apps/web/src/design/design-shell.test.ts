import { describe, expect, it } from "vitest";
import { read } from "./source";

describe("staff shell", () => {
  const shell = read("components/app-shell.tsx");
  it("shows the clinic's logo, and Primolar only as 'Powered by' (decisions #31, #32)", () => {
    expect(shell).not.toMatch(/PrimolarLogo|PrimolarMark/);
    expect(shell).toContain("<ClinicLogo");
    expect(shell).toContain("<PoweredByPrimolar");
    expect(read("features/portal/components/portal-shell.tsx")).toContain("<PoweredByPrimolar");
  });
  it("has no crayon strip on any surface", () => expect(shell).not.toContain("brand-strip"));
  it("marks the current page with a neutral pill, not a tint or a side bar", () => {
    expect(shell).not.toMatch(/bg-brand-subtle|left-0 w-1/);
    expect(shell).toContain("bg-selected font-bold");
  });
  it("marks the phone tab with an icon pill, not an edge bar", () => {
    expect(shell).not.toContain("h-[3px]");
    expect(shell).toContain("<BottomTabIcon");
    expect(read("components/bottom-tab.tsx")).toContain("bg-selected text-brand");
  });
});

describe("sign out", () => {
  const menu = read("features/auth/components/account-menu.tsx");
  it("is final, not destructive", () => {
    expect(menu).not.toContain('variant="destructive"');
    expect(menu).toContain('variant="strong"');
  });
  it("uses the confirm size instead of per-screen overrides", () => {
    expect(menu).toContain('size="confirm"');
    expect(menu).not.toContain("max-sm:");
  });
});
