"use client";
import { useState } from "react";
import Link from "next/link";
import { Controller, FormProvider, useForm, useFormContext, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { toast } from "sonner";
import { AlertCircleIcon, ShieldAlertIcon } from "lucide-react";
import {
  ClosePrivacyRequestInput, LogPrivacyRequestInput, PrivacyRequestChannel, PrivacyRequestKind,
  type PrivacyRequest,
} from "@pedia/shared";
import { ChoiceChips } from "@/components/choice-chips";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { usePatients } from "@/features/patients/api";
import { formatDate } from "@/lib/format";
import { KIND_LABEL, useClosePrivacyRequest, useLogPrivacyRequest } from "../api";

const KIND_HINT: Record<PrivacyRequestKind, string> = {
  access: "A copy of the child's records. Download it from the request's row once logged.",
  correction: "Something in the record is wrong. Fix it in the record, then close the request.",
  erasure: "Their record is hidden at once and erased when the law allows.",
  objection: "They object to how the child's data is used, such as reminders or photos.",
  other: "Anything else about the child's personal data.",
};
export const CHANNEL_LABEL: Record<PrivacyRequestChannel, string> = {
  in_person: "In person", phone: "Phone call", text: "Text message", email: "Email", letter: "Letter",
};
const OUTCOME_HINT: Record<PrivacyRequestKind, string> = {
  access: "For example: Copy of records given in person on Oct 20.",
  correction: "For example: Birth date corrected in the record.",
  erasure: "For example: Record restricted; erased when its retention ends.",
  objection: "For example: Reminders turned off for the child.",
  other: "What was done, or why it was declined.",
};
const MAX = 500;
const todayIso = () => format(new Date(), "yyyy-MM-dd");

/** "123 / 500": shown under a long free-text field, read out politely so it isn't noise while typing. */
function Counter({ value }: { value?: string }) {
  const n = value?.length ?? 0;
  return <p className={n > MAX ? "text-right text-xs text-danger" : "text-right text-xs text-ink-muted"}>{n} / {MAX}</p>;
}

/** The child, from the directory (GET /patients, as ⌘K). A chosen child shows by full name with "Change". */
function ChildPicker({ required }: { required: boolean }) {
  const { control, setValue } = useFormContext<LogPrivacyRequestInput>();
  const patientId = useWatch({ control, name: "patientId" });
  const [query, setQuery] = useState("");
  const [chosenName, setChosenName] = useState("");
  const found = usePatients(query.trim());
  const options = (found.data ?? []).slice(0, 8).map((p) => {
    const g = p.guardians.find((x) => x.isPrimary) ?? p.guardians[0];
    return { value: p.id, label: `${p.lastName}, ${p.firstName}`, description: [formatDate(p.birthDate), g?.fullName].filter(Boolean).join(" · ") };
  });

  return (
    <FormField name="patientId" label="Child" optional={!required} hint="Child's or guardian's name">
      {(props) =>
        patientId ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-ground/60 px-3 py-1.5">
            <span id={props.id} className="font-medium">{chosenName}</span>
            <Button type="button" variant="ghost" size="sm" onClick={() => setValue("patientId", undefined, { shouldDirty: true })}>
              Change
            </Button>
          </div>
        ) : (
          <Combobox
            {...props}
            query={query}
            onQueryChange={setQuery}
            options={options}
            emptyText={found.isPending ? "Searching" : "No matches"}
            onSelect={(id) => {
              const p = found.data?.find((x) => x.id === id);
              setChosenName(p ? `${p.firstName} ${p.lastName}` : "");
              setValue("patientId", id, { shouldDirty: true, shouldValidate: true });
            }}
          />
        )
      }
    </FormField>
  );
}

/** B13c2b: log a request that came in (Settings → Privacy). Six fields at most: a dialog (interaction-patterns). */
export function LogRequestDialog() {
  const [open, setOpen] = useState(false);
  const log = useLogPrivacyRequest();
  const fresh = (): LogPrivacyRequestInput => ({ kind: "access", requesterName: "", relationship: "", channel: "in_person", details: "", receivedOn: todayIso() });
  const form = useForm<LogPrivacyRequestInput>({ resolver: zodResolver(LogPrivacyRequestInput), defaultValues: fresh() });
  const [kind, details] = useWatch({ control: form.control, name: ["kind", "details"] });

  function onSubmit(input: LogPrivacyRequestInput) {
    log.mutate(input, {
      onSuccess: (r) => {
        toast.success(`Logged. Due ${formatDate(r.dueOn)}`);
        setOpen(false);
      },
      onError: (e) => toast.error(e.message),
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) form.reset(fresh());
        setOpen(o);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">Log a request</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Log a privacy request</DialogTitle>
          <DialogDescription>The due date is counted in working days from the day it was received.</DialogDescription>
        </DialogHeader>
        <FormProvider {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
            <FormField name="kind" label="What they asked for" hint={KIND_HINT[kind]}>
              {(props) => (
                <Controller
                  control={form.control}
                  name="kind"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger {...props} className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PrivacyRequestKind.options.map((k) => <SelectItem key={k} value={k}>{KIND_LABEL[k]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                />
              )}
            </FormField>
            <ChildPicker required={kind === "erasure"} />
            <div className="grid gap-4 sm:grid-cols-[3fr_2fr]">
              <FormField name="requesterName" label="Who asked">
                <Input autoComplete="off" {...form.register("requesterName")} />
              </FormField>
              <FormField name="relationship" label="Relationship" optional>
                <Input autoComplete="off" placeholder="Mother" {...form.register("relationship")} />
              </FormField>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField name="channel" label="How">
                {(props) => (
                  <Controller
                    control={form.control}
                    name="channel"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger {...props} className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {PrivacyRequestChannel.options.map((c) => <SelectItem key={c} value={c}>{CHANNEL_LABEL[c]}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                  />
                )}
              </FormField>
              <FormField name="receivedOn" label="Received on">
                <Input type="date" max={todayIso()} {...form.register("receivedOn")} />
              </FormField>
            </div>
            <div className="space-y-1">
              <FormField name="details" label="Details" optional>
                <Textarea rows={3} {...form.register("details")} />
              </FormField>
              <Counter value={details} />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={log.isPending} aria-busy={log.isPending}>
                {log.isPending ? "Logging" : "Log request"}
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}

/**
 * B13c2b: close a request with what was done. Approving an erasure is the one irreversible path (E5, skill
 * non-negotiable 4): the child's full name, what happens, and the child's first name typed before the button works
 * (typed confirmation: rare, catastrophic, wrong-child risk). Not a pattern for ordinary dialogs.
 */
export function CloseRequestDialog({ request: r }: { request: PrivacyRequest }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [refusal, setRefusal] = useState<string>();
  const close = useClosePrivacyRequest(r.id);
  const form = useForm<ClosePrivacyRequestInput>({ resolver: zodResolver(ClosePrivacyRequestInput), defaultValues: { status: "done", outcome: "" } });
  const [status, outcome] = useWatch({ control: form.control, name: ["status", "outcome"] });
  const restricts = r.kind === "erasure" && status === "done";
  const childName = r.patientName ?? "This child";
  const firstName = childName.split(/\s+/)[0]!;
  const confirmed = typed.trim().toLowerCase() === firstName.toLowerCase();

  function onSubmit(input: ClosePrivacyRequestInput) {
    if (restricts && !confirmed) return;
    setRefusal(undefined);
    close.mutate(input, {
      onSuccess: () => {
        toast.success(restricts ? `${firstName}'s record is restricted` : "Request closed");
        setOpen(false);
      },
      // A 409 (upcoming appointments, a pending request) stays in the dialog, in the server's words; the form is kept.
      onError: (e) => setRefusal(e.message),
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) {
          form.reset({ status: "done", outcome: "" });
          setTyped("");
          setRefusal(undefined);
        }
        setOpen(o);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">Close…</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Close {KIND_LABEL[r.kind].toLowerCase()} request</DialogTitle>
          <DialogDescription>
            From {r.requesterName}{r.patientName ? `, about ${r.patientName}` : ""}. Received {formatDate(r.receivedOn)}, due {formatDate(r.dueOn)}.
          </DialogDescription>
        </DialogHeader>
        <FormProvider {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
            <FormField name="status" label="Outcome">
              {(props) => (
                <ChoiceChips
                  {...props}
                  aria-labelledby={`${props.id}-label`}
                  options={[{ value: "done", label: r.kind === "erasure" ? "Approve" : "Done" }, { value: "declined", label: "Decline" }]}
                  value={status}
                  onChange={(v) => form.setValue("status", v)}
                />
              )}
            </FormField>
            <div className="space-y-1">
              <FormField name="outcome" label={status === "done" ? "What was done" : "Why it was declined"} hint={OUTCOME_HINT[r.kind]}>
                <Textarea rows={3} {...form.register("outcome")} />
              </FormField>
              <Counter value={outcome} />
            </div>

            {restricts && (
              <div className="space-y-3 rounded-lg border border-danger-line bg-danger-bg p-3 text-sm">
                <p className="flex items-start gap-2 text-danger">
                  <ShieldAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
                  <span>
                    <span className="font-semibold">{childName}&apos;s record will be hidden</span> from every list and from staff other than
                    you and admins. Photos and reminders turn off, and queued texts are withdrawn. You can&apos;t undo this in Primolar.
                  </span>
                </p>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={`confirm-${r.id}`} className="font-medium text-ink">
                    Type <span className="font-semibold">{firstName}</span> to confirm it&apos;s the right child
                  </label>
                  <Input id={`confirm-${r.id}`} autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} aria-describedby={`confirm-${r.id}-why`} />
                  <p id={`confirm-${r.id}-why`} className="text-xs text-ink-muted">The button stays off until the first name matches.</p>
                </div>
              </div>
            )}

            {refusal && (
              <div role="alert" className="flex items-start gap-2 rounded-lg border border-warning-line bg-warning-bg p-3 text-sm text-warning">
                <AlertCircleIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
                <span>
                  {refusal}.{" "}
                  {r.patientId && (
                    <Link href={`/patients/${r.patientId}`} className="font-medium underline underline-offset-2">Open {firstName}&apos;s record</Link>
                  )}
                </span>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Keep it open</Button>
              <Button
                type="submit"
                variant={restricts ? "destructive" : "default"}
                disabled={close.isPending || (restricts && !confirmed)}
                aria-busy={close.isPending}
              >
                {close.isPending ? "Saving" : restricts ? `Restrict ${firstName}'s record` : status === "done" ? "Close request" : "Decline request"}
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}
