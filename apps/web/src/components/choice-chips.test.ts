import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ChoiceChips } from "./choice-chips";

const opts = [{ value: "female", label: "Female" }, { value: "male", label: "Male" }] as const;
const html = (value: "" | "female") =>
  renderToStaticMarkup(h(ChoiceChips<"female" | "male">, { "aria-label": "Sex", options: opts, value, onChange: () => {} }));

it("is a radio group with nothing chosen by default", () => {
  expect(html("")).toContain('role="radiogroup"');
  expect(html("")).not.toContain('aria-checked="true"');
});
it("checks exactly the chosen option, and selection is neutral", () => {
  expect(html("female").match(/aria-checked="true"/g)).toHaveLength(1);
  expect(html("female")).toContain("data-[state=checked]:bg-selected");
  expect(html("female")).not.toContain("bg-brand-subtle");
});
