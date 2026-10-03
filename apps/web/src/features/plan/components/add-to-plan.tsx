"use client";
import { useState } from "react";
import { toast } from "sonner";
import type { ToothCondition, ToothNumber, ToothState } from "@pedia/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useProcedures } from "@/features/clinic/api";
import { useAddPlanItem, usePlan } from "../api";
import { PLAN_STATUS_LABEL } from "../api";

/** What a finding usually leads to. Only a starting suggestion; staff pick any per-tooth procedure. */
const SUGGESTED: Partial<Record<ToothCondition, string>> = {
  caries: "restoration",
  sound: "sealant",
  pulpotomy: "restoration",
  pulpectomy: "restoration",
};

/** Plan treatment for one tooth from the chart, linked to its latest finding. */
export function AddToPlan({ patientId, tooth, state }: { patientId: string; tooth: ToothNumber; state?: ToothState }) {
  const procedures = (useProcedures().data ?? []).filter((p) => p.perTooth);
  const planned = (usePlan(patientId).data ?? []).filter((i) => i.tooth === tooth);
  const add = useAddPlanItem(patientId);
  const latest = state?.history.findLast((e) => !state.history.some((x) => x.supersedes === e.id));
  const [code, setCode] = useState((latest && SUGGESTED[latest.condition]) ?? "restoration");
  const procedure = procedures.find((p) => p.code === code);
  const name = (c: string) => procedures.find((p) => p.code === c)?.name ?? c;

  return (
    <section className="space-y-2">
      <h3 className="font-semibold">Treatment plan</h3>
      {planned.length > 0 && (
        <ul className="space-y-1 text-sm">
          {planned.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-2">
              {name(i.procedureCode)}
              <Badge variant={i.status === "done" ? "default" : "outline"}>{PLAN_STATUS_LABEL[i.status]}</Badge>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Select value={code} onValueChange={setCode}>
          <SelectTrigger aria-label="Procedure to plan" className="flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {procedures.map((p) => (
              <SelectItem key={p.code} value={p.code}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          disabled={!procedure || add.isPending}
          onClick={() =>
            procedure &&
            add.mutate(
              { procedureCode: procedure.code, tooth, fee: procedure.fee, sourceChartEntryId: latest?.id },
              {
                onSuccess: () => toast.success(`${procedure.name} on ${tooth} added to the plan`),
                onError: (e) => toast.error(e.message),
              },
            )
          }
        >
          Add to plan
        </Button>
      </div>
    </section>
  );
}
