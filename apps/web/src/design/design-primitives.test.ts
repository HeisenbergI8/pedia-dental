import { createElement as h, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { InboxIcon } from "lucide-react";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { EmptyState } from "@/components/empty-state";
import { FormField } from "@/components/form-field";
import { SectionCard } from "@/components/section-card";
import { Segmented } from "@/components/segmented";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { read } from "./source";

const html = (el: ReactElement) => renderToStaticMarkup(el);

describe("Button", () => {
  it("primary carries the coloured lift", () => expect(html(h(Button, null, "Save"))).toContain("shadow-button"));
  it("outline is a white secondary with a hairline, never an ink edge", () => {
    const out = html(h(Button, { variant: "outline" }, "Cancel"));
    expect(out).toContain("border-control-border");
    expect(out).toContain("bg-surface");
    expect(out).not.toMatch(/dark:border-input/);
  });
  it("strong is solid ink", () => expect(html(h(Button, { variant: "strong" }, "Sign out"))).toContain("bg-ink"));
});

describe("EmptyState", () => {
  it("is quiet by default: no dashed box, no sticker, no Fredoka", () => {
    const out = html(h(EmptyState, { icon: InboxIcon, title: "No messages" }));
    expect(out).not.toMatch(/border-dashed|shadow-crayon|font-display/);
  });
  it("keeps the hand-drawn badge when warm", () => {
    expect(html(h(EmptyState, { icon: InboxIcon, title: "All done", tone: "warm" }))).toContain("shadow-crayon");
  });
});

it("SectionCard is an 18px card", () => expect(html(h(SectionCard, { title: "Visits", children: "x" }))).toContain("rounded-2xl"));

it("Segmented presses exactly one option", () => {
  const out = html(
    h(Segmented<"day" | "week">, { label: "View", value: "week", onChange: () => {}, options: [{ value: "day", label: "Day" }, { value: "week", label: "Week" }] }),
  );
  expect(out.match(/aria-pressed="true"/g)).toHaveLength(1);
  expect(out).toContain("bg-track");
});

it("line tabs underline in brand", () => {
  const out = html(h(Tabs, { defaultValue: "a" }, h(TabsList, { variant: "line" }, h(TabsTrigger, { value: "a" }, "A"))));
  expect(out).toContain("after:bg-brand");
});

it("overlays use the scrim token, not black", () => {
  expect(read("components/ui/dialog.tsx") + read("components/ui/sheet.tsx")).not.toContain("bg-black");
});

function InForm({ children }: { children: ReactElement }) {
  return h(FormProvider, { ...useForm(), children });
}

describe("FormField", () => {
  it("marks optional fields in words and wires the hint to the control", () => {
    const out = html(h(InForm, null, h(FormField, { name: "school", label: "School", optional: true, hint: "Where the child studies", children: h(Input) })));
    expect(out).toContain("(optional)");
    expect(out).toMatch(/<input[^>]*aria-describedby="[^"]*-hint"/);
  });
  it("a required field says nothing extra", () => {
    expect(html(h(InForm, null, h(FormField, { name: "firstName", label: "First name", children: h(Input) })))).not.toContain("optional");
  });
});
