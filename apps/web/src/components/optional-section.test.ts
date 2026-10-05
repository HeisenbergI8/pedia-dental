import { createElement as h, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FormProvider, useForm } from "react-hook-form";
import { expect, it } from "vitest";
import { OptionalSection } from "./optional-section";

function Host({ values, children }: { values: Record<string, unknown>; children: ReactElement }) {
  return h(FormProvider, { ...useForm({ defaultValues: values }), children });
}
const render = (values: Record<string, unknown>) =>
  renderToStaticMarkup(h(Host, { values, children: h(OptionalSection, { title: "Background", fields: ["school", "referredBy", "tags"], children: "x" }) }));

it("is closed and inviting when nothing is filled", () => {
  const out = render({ school: "", referredBy: "", tags: [] });
  expect(out).toContain("Add now or later");
  expect(out).toContain('data-state="closed"');
});
it("counts what is filled and starts open, so edit mode shows existing data", () => {
  const out = render({ school: "Imus Elementary", referredBy: "", tags: ["HMO"] });
  expect(out).toContain("2 of 3 filled");
  expect(out).toContain('data-state="open"');
});
