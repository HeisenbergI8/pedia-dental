"use client";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { CLINIC_NAME, PLACEHOLDERS, UpdateMessageTemplateInput, renderMessage, type MessageTemplate, type Placeholder } from "@pedia/shared";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useMessageTemplates, useUpdateMessageTemplate } from "../api";
import { Loading } from "@/components/brand";

/** Sample values for the preview, so staff see a real-looking message, never the raw placeholders. */
const SAMPLE: Record<Placeholder, string> = {
  child_first_name: "Bea",
  child_name: "Bea Mendoza",
  guardian_name: "Rosa Mendoza",
  date: "Mon, Oct 12",
  time: "9:00 AM",
  dentist_name: "Dr. Ana Reyes",
  clinic_name: CLINIC_NAME,
};

export function TemplateEditor() {
  const { data: templates = [], isLoading, error } = useMessageTemplates();
  const [kind, setKind] = useState<MessageTemplate["kind"]>("appointment_confirmation");
  if (isLoading) return <Loading label="Loading templates…" />;
  if (error) return <p className="text-danger">Couldn&apos;t load templates. Refresh to try again.</p>;
  const current = templates.find((t) => t.kind === kind);

  return (
    <div className="grid gap-5 lg:grid-cols-[16rem_1fr]">
      <nav aria-label="Templates">
        <ul className="flex flex-col gap-0.5">
          {templates.map((t) => (
            <li key={t.kind}>
              <button
                type="button"
                onClick={() => setKind(t.kind)}
                aria-current={t.kind === kind ? "true" : undefined}
                className={cn("min-h-10 w-full rounded-lg px-3 text-left text-sm", t.kind === kind ? "bg-brand-subtle font-medium text-brand" : "hover:bg-ground")}
              >
                {t.name}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      {current && <Editor key={current.kind} template={current} />}
    </div>
  );
}

function Editor({ template }: { template: MessageTemplate }) {
  const save = useUpdateMessageTemplate();
  const [body, setBody] = useState(template.body);
  const area = useRef<HTMLTextAreaElement>(null);
  const parsed = UpdateMessageTemplateInput.safeParse({ body });
  const problem = parsed.success ? undefined : parsed.error.issues[0]?.message;
  const preview = renderMessage(body, SAMPLE);
  const segments = Math.max(1, Math.ceil(preview.length / 160));

  function insert(p: Placeholder) {
    const el = area.current;
    const at = el?.selectionStart ?? body.length;
    setBody(`${body.slice(0, at)}{${p}}${body.slice(el?.selectionEnd ?? at)}`);
    requestAnimationFrame(() => el?.focus());
  }

  return (
    <section aria-labelledby="template-title" className="space-y-4 rounded-xl border border-line bg-surface p-4 shadow-card sm:p-5">
      <h2 id="template-title" className="text-base font-semibold">
        {template.name}
      </h2>
      <div className="space-y-1.5">
        <Label htmlFor="template-body">Message</Label>
        <Textarea
          id="template-body"
          ref={area}
          rows={5}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          aria-invalid={!!problem}
          aria-describedby="template-body-help"
        />
        <p id="template-body-help" className={cn("text-sm", problem ? "text-danger" : "text-ink-muted")}>
          {problem ?? `${preview.length} characters · ${segments} text message${segments > 1 ? "s" : ""}`}
        </p>
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-medium">Insert a placeholder</p>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(PLACEHOLDERS) as Placeholder[]).map((p) => (
            <Button key={p} type="button" size="sm" variant="outline" onClick={() => insert(p)} title={PLACEHOLDERS[p]}>
              {`{${p}}`}
            </Button>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-medium">Preview with sample details</p>
        <p className="rounded-lg bg-ground p-3 text-sm whitespace-pre-wrap">{preview}</p>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" disabled={body === template.body} onClick={() => setBody(template.body)}>
          Undo changes
        </Button>
        <Button
          disabled={!!problem || body === template.body || save.isPending}
          onClick={() =>
            save.mutate({ kind: template.kind, body }, { onSuccess: () => toast.success(`${template.name} saved`), onError: (e) => toast.error(e.message) })
          }
        >
          Save template
        </Button>
      </div>
    </section>
  );
}
