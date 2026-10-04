import { describe, expect, it } from "vitest";
import { filesMatching, read } from "./source";

describe("warmth lives on login and the portal only", () => {
  it("the crayon strip", () => {
    expect(filesMatching(/\bbrand-strip\b/)).toEqual([
      "app/globals.css",
      "features/auth/components/login-screen.tsx",
      "features/portal/components/portal-shell.tsx",
    ]);
  });
  it("Fredoka", () => {
    expect(filesMatching(/\bfont-display\b/)).toEqual([
      "app/globals.css",
      "components/empty-state.tsx",
      "features/auth/components/login-screen.tsx",
      "features/portal/components/portal-home.tsx",
    ]);
  });
  it("every portal empty state is warm", () => {
    for (const f of filesMatching(/<EmptyState/).filter((f) => f.startsWith("features/portal/"))) {
      const text = read(f);
      expect(text.match(/<EmptyState/g)?.length, f).toBe(text.match(/<EmptyState tone="warm"/g)?.length);
    }
  });
});

describe("staff calm", () => {
  it("no dashed outlines anywhere", () => expect(filesMatching(/\bborder-dashed\b/)).toEqual([]));
  it("selection is neutral, not a brand tint", () => expect(filesMatching(/\?\s*"bg-brand-subtle/)).toEqual([]));
  it("one-of-N toggles use Segmented", () => expect(filesMatching(/bg-line\/60/)).toEqual([]));
});
