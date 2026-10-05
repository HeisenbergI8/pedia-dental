"use client";
import { useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { format, isValid } from "date-fns";
import { AlertTriangleIcon } from "lucide-react";
import type { Chair, Procedure, StaffMember } from "@pedia/shared";
import { ChoiceChips } from "@/components/choice-chips";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePatient, usePatients } from "@/features/patients/api";
import { formatAge } from "@/features/patients/age";
import { formatPhone } from "@/lib/format";
import { COMMON_PROCEDURES, procedureHint, rankPatients, slotKey, whenLabel } from "../booking";
import type { BookingValues } from "./appointment-form";

const REGISTER = "__register";

export function SelectField({ name, label, options }: { name: keyof BookingValues; label: string; options: { value: string; label: string }[] }) {
  const { control } = useFormContext<BookingValues>();
  return (
    <FormField name={name} label={label}>
      {(props) => (
        <Controller
          control={control}
          name={name}
          render={({ field }) => (
            <Select value={String(field.value)} onValueChange={field.onChange}>
              <SelectTrigger {...props} className="w-full">
                <SelectValue placeholder="Choose" />
              </SelectTrigger>
              <SelectContent>
                {options.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      )}
    </FormField>
  );
}

/** Search by child, guardian or phone. Children booked soon come first; the last row registers a new patient. */
export function PatientPicker({ bookedIds, onRegister }: { bookedIds: string[]; onRegister: (query: string) => void }) {
  const { control, setValue } = useFormContext<BookingValues>();
  const patientId = useWatch({ control, name: "patientId" });
  const [query, setQuery] = useState("");
  const found = usePatients(query.trim());
  const chosen = usePatient(patientId).data;

  if (patientId && chosen) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Patient</span>
          <div className="flex items-center gap-3 rounded-xl border border-line bg-ground px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                {chosen.firstName} {chosen.lastName} <span className="font-normal text-ink-muted">· {formatAge(chosen.birthDate)}</span>
              </p>
              {chosen.allergies.length > 0 && (
                <ul className="mt-1 flex flex-wrap gap-1.5">
                  {chosen.allergies.map((a) => (
                    <li key={a} className="inline-flex items-center gap-1 rounded-md border border-alert-line bg-alert-bg px-2 py-0.5 text-xs font-semibold text-alert">
                      <AlertTriangleIcon className="size-3.5" aria-hidden />
                      Allergy: {a}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => setValue("patientId", "", { shouldDirty: true })}>
              Change
            </Button>
          </div>
      </div>
    );
  }

  const q = query.trim();
  const options = rankPatients(found.data ?? [], bookedIds)
    .slice(0, 8)
    .map((p) => {
      const g = p.guardians.find((x) => x.isPrimary) ?? p.guardians[0];
      return {
        value: p.id,
        label: `${p.lastName}, ${p.firstName}`,
        description: g ? [g.fullName, g.phone && formatPhone(g.phone)].filter(Boolean).join(" · ") : undefined,
      };
    });
  if (q) options.push({ value: REGISTER, label: `Register "${q}" as a new patient`, description: undefined });

  return (
    <FormField name="patientId" label="Patient" hint="Child's name, guardian's name or phone">
      {(props) => (
        <Combobox
          {...props}
          query={query}
          onQueryChange={setQuery}
          options={options}
          emptyText={found.isPending ? "Searching" : "No matches"}
          onSelect={(value) => (value === REGISTER ? onRegister(q) : setValue("patientId", value, { shouldValidate: true, shouldDirty: true }))}
        />
      )}
    </FormField>
  );
}

/** The common procedures as chips; picking one fills the reason and the length. */
export function ProcedurePicker({ procedures }: { procedures: Procedure[] }) {
  const { control, register, setValue, formState } = useFormContext<BookingValues>();
  const [code, reason] = useWatch({ control, name: ["procedureCode", "reason"] });
  const [showAll, setShowAll] = useState(false);
  const [editReason, setEditReason] = useState(false);
  const chosen = procedures.find((p) => p.code === code);
  // A recall's or a parent's procedure may not be a common one: it stays visible either way.
  const shown = showAll ? procedures : procedures.filter((p) => COMMON_PROCEDURES.includes(p.code) || p.code === code);

  return (
    <>
      <FormField name="procedureCode" label="What for">
        {(props) => (
          <div className="flex flex-wrap items-center gap-2">
            <ChoiceChips
              {...props}
              aria-labelledby={`${props.id}-label`}
              options={shown.map((p) => ({ value: p.code, label: p.name }))}
              value={code}
              onChange={(c) => {
                const p = procedures.find((x) => x.code === c);
                if (!p) return;
                setValue("procedureCode", p.code, { shouldDirty: true });
                setValue("reason", p.name, { shouldValidate: true });
                setValue("durationMin", p.defaultDurationMin, { shouldValidate: true });
              }}
            />
            {procedures.length > shown.length || showAll ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowAll(!showAll)}>
                {showAll ? "Fewer" : "More"}
              </Button>
            ) : null}
          </div>
        )}
      </FormField>
      {chosen && !editReason && !formState.errors.reason ? (
        <p className="-mt-2 text-sm text-ink-muted">
          {procedureHint(chosen)} · Reason: {reason}{" "}
          <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={() => setEditReason(true)}>
            Edit reason
          </Button>
        </p>
      ) : (
        <FormField name="reason" label="Reason">
          <Input {...register("reason")} />
        </FormField>
      )}
    </>
  );
}

/** Dentists as chips, each saying why it might be the right one. */
export function DentistPicker({ dentists, myId, lastId, childName }: { dentists: StaffMember[]; myId?: string; lastId?: string; childName?: string }) {
  const { control, setValue } = useFormContext<BookingValues>();
  const dentistId = useWatch({ control, name: "dentistId" });
  return (
    <FormField name="dentistId" label="Dentist">
      {(props) => (
        <ChoiceChips
          {...props}
          aria-labelledby={`${props.id}-label`}
          options={dentists.map((d) => ({
            value: d.id,
            label: d.fullName,
            hint: d.id === myId ? "You" : d.id === lastId ? `Saw ${childName ?? "this child"} last` : undefined,
          }))}
          value={dentistId}
          onChange={(v) => setValue("dentistId", v, { shouldDirty: true, shouldValidate: true })}
        />
      )}
    </FormField>
  );
}

/** Date, start, length and chair, typed by hand. Used to pick another time and to move an appointment. */
export function TimeFields({ chairs }: { chairs: Chair[] }) {
  const { register } = useFormContext<BookingValues>();
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField name="date" label="Date">
          <Input type="date" {...register("date")} />
        </FormField>
        <FormField name="time" label="Start">
          <Input type="time" step={900} {...register("time")} />
        </FormField>
        <FormField name="durationMin" label="Minutes">
          <Input type="number" min={5} step={5} {...register("durationMin", { valueAsNumber: true })} />
        </FormField>
      </div>
      <SelectField name="chairId" label="Chair" options={chairs.map((c) => ({ value: c.id, label: c.name }))} />
    </>
  );
}

/** The next open times for this dentist as cards; "Pick another date or time" hands over to TimeFields. */
export function SlotPicker({
  slots,
  chairs,
  dentistChosen,
  onCustom,
}: {
  slots: { startsAt: Date; chairId: string }[];
  chairs: Chair[];
  dentistChosen: boolean;
  onCustom: () => void;
}) {
  const { control, setValue } = useFormContext<BookingValues>();
  const [date, time, chairId] = useWatch({ control, name: ["date", "time", "chairId"] });
  const at = new Date(`${date}T${time}`);
  const value = isValid(at) ? slotKey({ startsAt: at, chairId }) : "";
  const chairName = (id: string) => chairs.find((c) => c.id === id)?.name ?? "";

  return (
    <FormField name="time" label="When">
      {(props) =>
        !dentistChosen ? (
          <p className="text-sm text-ink-muted">Pick a dentist to see open times.</p>
        ) : (
          <div className="space-y-2">
            <ChoiceChips
              {...props}
              aria-labelledby={`${props.id}-label`}
              size="card"
              options={slots.map((s) => ({ value: slotKey(s), label: whenLabel(s.startsAt), hint: chairName(s.chairId) }))}
              value={value}
              onChange={(key) => {
                const s = slots.find((x) => slotKey(x) === key);
                if (!s) return;
                setValue("date", format(s.startsAt, "yyyy-MM-dd"));
                setValue("time", format(s.startsAt, "HH:mm"), { shouldValidate: true });
                setValue("chairId", s.chairId, { shouldValidate: true });
              }}
            />
            <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={onCustom}>
              Pick another date or time
            </Button>
          </div>
        )
      }
    </FormField>
  );
}
