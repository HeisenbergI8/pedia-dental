"use client";
import { useId, type ReactNode } from "react";
import { get, useFormContext } from "react-hook-form";
import { Slot } from "radix-ui";
import { Label } from "@/components/ui/label";

type ControlProps = { id: string; "aria-invalid": boolean; "aria-describedby"?: string };

/**
 * Label, control and error message for one React Hook Form field. Must sit
 * inside a <FormProvider>. `name` may be nested ("guardians.0.phone").
 * Pass a function as children when the labelled element isn't the direct
 * child, e.g. a Select's trigger inside a Controller.
 */
export function FormField({
  name,
  label,
  children,
}: {
  name: string;
  label: string;
  children: ReactNode | ((control: ControlProps) => ReactNode);
}) {
  const id = useId();
  const { formState } = useFormContext();
  const message: string | undefined = get(formState.errors, name)?.message;
  const control: ControlProps = {
    id,
    "aria-invalid": !!message,
    "aria-describedby": message ? `${id}-error` : undefined,
  };

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {typeof children === "function" ? children(control) : <Slot.Root {...control}>{children}</Slot.Root>}
      {message && (
        <p id={`${id}-error`} className="text-sm text-danger">
          {message}
        </p>
      )}
    </div>
  );
}
