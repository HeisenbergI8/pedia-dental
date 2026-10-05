import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { Combobox } from "./combobox";

it("is an ARIA combobox that starts collapsed", () => {
  const out = renderToStaticMarkup(h(Combobox, { query: "", onQueryChange: () => {}, options: [{ value: "p1", label: "Bea Mendoza" }], onSelect: () => {} }));
  expect(out).toContain('role="combobox"');
  expect(out).toContain('aria-autocomplete="list"');
  expect(out).toContain('aria-expanded="false"');
});
