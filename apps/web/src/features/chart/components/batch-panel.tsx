"use client";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { CreateChartBatchInput, commonSurfaces, toothName, type ToothNumber, type Visit } from "@pedia/shared";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useRecordChartBatch } from "../api";
import { FindingFields, PanelAllergies } from "./tooth-panel";

/** One finding on several teeth: the single-tooth form's fields, saved as one entry per tooth, all or none. */
export function BatchPanel({
  patientId,
  teeth,
  visit,
  onClose,
}: {
  patientId: string;
  teeth: ToothNumber[];
  visit: Visit;
  onClose: (saved: boolean) => void;
}) {
  const record = useRecordChartBatch(patientId);
  const sorted = [...teeth].sort((a, b) => a - b);
  const form = useForm<CreateChartBatchInput>({
    resolver: zodResolver(CreateChartBatchInput),
    defaultValues: { visitId: visit.id, teeth: sorted, surfaces: [], condition: "caries", note: "" },
  });

  const onSubmit = (input: CreateChartBatchInput) =>
    record.mutate(
      { ...input, note: input.note?.trim() || undefined },
      {
        onSuccess: (rows) => {
          toast.success(`Finding saved on ${rows.length} teeth`);
          onClose(true);
        },
        onError: (e) => toast.error(e.message),
      },
    );

  return (
    <Sheet open onOpenChange={(open) => !open && onClose(false)}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader className="gap-1 border-b border-line">
          {/* Every number and name, so a wrong pick is caught before saving (the wrong-tooth risk). */}
          <SheetTitle className="text-lg">{sorted.length} teeth</SheetTitle>
          <SheetDescription>{sorted.map((t) => `${t} · ${toothName(t)}`).join("; ")}</SheetDescription>
          <PanelAllergies patientId={patientId} />
        </SheetHeader>
        <FormProvider {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4 px-4 pb-6">
            <FindingFields surfaces={commonSurfaces(sorted)} hint="Only surfaces every picked tooth has. None checked = the whole tooth." />
            <Button type="submit" disabled={record.isPending}>
              {record.isPending ? "Saving…" : `Save on ${sorted.length} teeth`}
            </Button>
          </form>
        </FormProvider>
      </SheetContent>
    </Sheet>
  );
}
