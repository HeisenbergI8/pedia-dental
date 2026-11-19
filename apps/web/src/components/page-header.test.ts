import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PageHeader } from "./page-header";
import { SectionCard } from "./section-card";
import { Button } from "./ui/button";

// Issue 25: a long one-word name (a clinic's, a child's) wraps instead of pushing a 375 px page sideways.
describe("long unbroken words wrap", () => {
  const word = "Maximilian".repeat(6);

  it("in the page title and its description", () => {
    const out = renderToStaticMarkup(h(PageHeader, { title: word, description: word }));
    expect(out).toMatch(/<h1 class="[^"]*wrap-anywhere/);
    expect(out).toMatch(/<p class="[^"]*wrap-anywhere/);
  });

  it("in a card's title and description", () => {
    const out = renderToStaticMarkup(h(SectionCard, { title: word, description: word, children: "x" }));
    expect(out).toMatch(/<h2 class="[^"]*wrap-anywhere/);
    expect(out).toMatch(/<p class="[^"]*wrap-anywhere/);
  });

  it("in a button that names a child (the portal's records download): it may grow to two lines", () => {
    const out = renderToStaticMarkup(h(Button, { className: "h-auto min-h-11 max-w-full py-2 whitespace-normal" }, `Download ${word}'s records`));
    expect(out).toContain("whitespace-normal");
    expect(out).not.toMatch(/whitespace-nowrap|\bh-9\b/);
  });
});
