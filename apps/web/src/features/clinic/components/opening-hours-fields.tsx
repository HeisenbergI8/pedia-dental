"use client";
import { Controller, useFormContext } from "react-hook-form";
import { FormField } from "@/components/form-field";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** Minutes from midnight ⇄ the "08:00" a time input holds. */
const toTime = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const fromTime = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/**
 * A branch's opening hours (an `OpeningHours` at `name` in the surrounding form): opens, closes, and the weekdays it
 * never opens. The branch dialog and the sign-up forms share it. The closing-time refine reports on `${name}.closesAt`.
 */
export function OpeningHoursFields({ name }: { name: "openingHours" | "branch.openingHours" }) {
  const { control } = useFormContext();
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        {(["opensAt", "closesAt"] as const).map((key) => (
          <FormField key={key} name={`${name}.${key}`} label={key === "opensAt" ? "Opens" : "Closes"}>
            {(props) => (
              <Controller
                control={control}
                name={`${name}.${key}`}
                render={({ field }) => (
                  <Input {...props} type="time" step={900} value={toTime(field.value as number)} onChange={(e) => e.target.value && field.onChange(fromTime(e.target.value))} />
                )}
              />
            )}
          </FormField>
        ))}
      </div>
      <Controller
        control={control}
        name={`${name}.closedWeekdays`}
        render={({ field }) => {
          const days = field.value as number[];
          return (
            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold">Closed on</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {WEEKDAYS.map((label, day) => (
                  <label key={label} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      aria-label={label}
                      checked={days.includes(day)}
                      onCheckedChange={(on) => field.onChange(on ? [...days, day].sort() : days.filter((d) => d !== day))}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
          );
        }}
      />
    </>
  );
}
