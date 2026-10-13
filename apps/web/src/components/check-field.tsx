"use client";
import { useId, type ReactNode } from "react";
import { Controller, get, useFormContext } from "react-hook-form";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

/**
 * A checkbox bound to a boolean React Hook Form field, its label beside it (which may hold links), and its error.
 * For acceptances and consents (privacy #7, #8, #12), where the label is a sentence rather than a field name.
 */
export function CheckField({ name, children }: { name: string; children: ReactNode }) {
  const id = useId();
  const { control, formState } = useFormContext();
  const message: string | undefined = get(formState.errors, name)?.message;
  return (
    <div className="space-y-1.5">
      <div className="flex items-start gap-3">
        <Controller
          control={control}
          name={name}
          render={({ field }) => (
            <Checkbox
              id={id}
              className="mt-0.5"
              checked={field.value === true}
              onCheckedChange={(on) => field.onChange(on === true)}
              onBlur={field.onBlur}
              aria-invalid={!!message}
              aria-describedby={message ? `${id}-error` : undefined}
            />
          )}
        />
        <Label htmlFor={id} className="font-normal leading-snug">
          {children}
        </Label>
      </div>
      {message && (
        <p id={`${id}-error`} className="text-sm text-danger">
          {message}
        </p>
      )}
    </div>
  );
}
