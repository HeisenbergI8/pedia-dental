"use client";
import { useState } from "react";
import { format, parseISO } from "date-fns";
import { MoreHorizontalIcon } from "lucide-react";
import { toast } from "sonner";
import { formatPeso, isValidTooth, pesos, planProgress, type PlanItem, type PlanItemStatus } from "@pedia/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCan } from "@/features/auth/access";
import { useProcedures } from "@/features/clinic/api";
import { useNoteTemplates, useNotes } from "@/features/notes/api";
import { useVisits } from "@/features/visits/api";
import { cn } from "@/lib/utils";
import { PLAN_STATUS_LABEL, useAddPlanItem, usePlan, useSetPlanItemStatus } from "../api";
import { Loading } from "@/components/brand";
import { ErrorState } from "@/components/error-state";

export function PlanTab({ patientId }: { patientId: string }) {
  const { data: items, isLoading, error, refetch, isRefetching } = usePlan(patientId);
  const procedures = useProcedures().data ?? [];
  const visits = useVisits(patientId).data ?? [];
  const notes = useNotes(patientId).data ?? [];
  const templates = useNoteTemplates().data ?? [];
  const setStatus = useSetPlanItemStatus(patientId);
  const canEdit = useCan()("plan.write");

  if (isLoading) return <Loading label="Loading treatment plan" />;
  if (error || !items) return <ErrorState what="the treatment plan" onRetry={() => refetch()} retrying={isRefetching} />;

  const { done, total } = planProgress(items);
  const totalFee = items.filter((i) => i.status !== "declined").reduce((sum, i) => sum + i.fee, 0);
  const procedureName = (code: string) => procedures.find((p) => p.code === code)?.name ?? code;
  const completedBy = (i: PlanItem) => {
    const visit = visits.find((v) => v.id === i.completedVisitId);
    const note = notes.find((n) => n.id === i.completedNoteId);
    const template = templates.find((t) => t.id === note?.templateId);
    return [visit && format(parseISO(visit.date), "MMM d, yyyy"), template && `${template.name} note`].filter(Boolean).join(" · ");
  };
  const change = (id: string, status: Exclude<PlanItemStatus, "done">) =>
    setStatus.mutate({ id, status }, { onError: (e) => toast.error(e.message) });

  return (
    <div className="space-y-6">
      <section className="space-y-4 rounded-xl border border-line bg-surface p-4 shadow-card sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold">Treatment plan</h2>
          <p className="text-sm text-ink-muted">
            Total <span className="text-base font-semibold text-ink tabular-nums">{formatPeso(totalFee)}</span>
          </p>
        </div>
        <div className="space-y-1.5">
          <p className="font-medium" id="plan-progress">
            {done} of {total} done
          </p>
          <div
            role="progressbar"
            aria-labelledby="plan-progress"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={done}
            className="h-2.5 overflow-hidden rounded-full bg-track ring-1 ring-line-strong ring-inset"
          >
            <div className="h-full rounded-full bg-brand" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
          </div>
          <p className="text-sm text-ink-muted">Items are completed by signing the matching clinical note.</p>
        </div>

        {items.length === 0 ? (
          <p className="text-ink-muted">Nothing planned yet. Add items below, or from a tooth on the chart.</p>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <Checkbox checked={i.status === "done"} disabled aria-label={`${PLAN_STATUS_LABEL[i.status]}`} />
                <div className="min-w-0 flex-1">
                  <p className={cn("font-medium", i.status === "declined" && "text-ink-muted")}>
                    {procedureName(i.procedureCode)}
                    {i.tooth && <span className="font-normal"> · tooth {i.tooth}</span>}
                  </p>
                  {i.status === "done" && <p className="text-sm text-ink-muted">{completedBy(i)}</p>}
                </div>
                <span className="ml-auto text-sm tabular-nums">{formatPeso(i.fee)}</span>
                <Badge variant={i.status === "done" ? "default" : "outline"}>{PLAN_STATUS_LABEL[i.status]}</Badge>
                {canEdit && i.status !== "done" && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon" variant="ghost" aria-label={`Change status of ${procedureName(i.procedureCode)}`}>
                        <MoreHorizontalIcon />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {i.status !== "in_progress" && i.status !== "declined" && (
                        <DropdownMenuItem onSelect={() => change(i.id, "in_progress")}>Mark in progress</DropdownMenuItem>
                      )}
                      {i.status !== "planned" && (
                        <DropdownMenuItem onSelect={() => change(i.id, "planned")}>Back to planned</DropdownMenuItem>
                      )}
                      {i.status !== "declined" && (
                        <DropdownMenuItem onSelect={() => change(i.id, "declined")}>Declined by parent</DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {canEdit && <AddPlanItemForm patientId={patientId} />}
    </div>
  );
}

function AddPlanItemForm({ patientId }: { patientId: string }) {
  const procedures = useProcedures().data ?? [];
  const add = useAddPlanItem(patientId);
  const [code, setCode] = useState<string>();
  const [tooth, setTooth] = useState("");
  const [fee, setFee] = useState("");
  const procedure = procedures.find((p) => p.code === code);
  const toothNumber = Number(tooth);
  const toothError = procedure?.perTooth && tooth && !isValidTooth(toothNumber) ? "Not an FDI tooth number" : undefined;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!procedure || toothError || (procedure.perTooth && !tooth)) return;
    add.mutate(
      { procedureCode: procedure.code, tooth: procedure.perTooth ? toothNumber : undefined, fee: pesos(Number(fee)) },
      {
        onSuccess: () => {
          toast.success(`${procedure.name} added to the plan`);
          setCode(undefined);
          setTooth("");
          setFee("");
        },
        onError: (e) => toast.error(e.message),
      },
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-3 rounded-xl border border-line bg-surface p-4 shadow-card sm:p-5">
      <h3 className="font-semibold">Add to plan</h3>
      <div className="grid items-end gap-3 md:grid-cols-[minmax(0,1fr)_6rem_8rem_auto]">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="plan-procedure">Procedure</Label>
          <Select
            value={code ?? ""}
            onValueChange={(c) => {
              setCode(c);
              setFee(String((procedures.find((p) => p.code === c)?.fee ?? 0) / 100));
            }}
          >
            <SelectTrigger id="plan-procedure" className="w-full">
              <SelectValue placeholder="Choose a procedure" />
            </SelectTrigger>
            <SelectContent>
              {procedures.map((p) => (
                <SelectItem key={p.code} value={p.code}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="plan-tooth">Tooth</Label>
          <Input
            id="plan-tooth"
            inputMode="numeric"
            disabled={!procedure?.perTooth}
            placeholder={procedure?.perTooth ? "e.g. 74" : "n/a"}
            value={tooth}
            onChange={(e) => setTooth(e.target.value)}
            aria-invalid={!!toothError}
            aria-describedby={toothError ? "plan-tooth-error" : undefined}
          />
          {toothError && <p id="plan-tooth-error" className="text-sm text-danger">{toothError}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="plan-fee">Fee (₱)</Label>
          <Input id="plan-fee" type="number" min={0} step="0.01" value={fee} onChange={(e) => setFee(e.target.value)} />
        </div>
        <Button
          type="submit"
          disabled={!procedure || add.isPending || !!toothError || (procedure.perTooth && !tooth)}
        >
          Add
        </Button>
      </div>
    </form>
  );
}
