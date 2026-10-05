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
  optional = false,
  hint,
  children,
}: {
  name: string;
  label: string;
  /** Says "(optional)" after the label (GOV.UK: mark the optional ones, not the required ones). */
  optional?: boolean;
  /** Help between the label and the control, e.g. "4 years 2 months". Read out with the control. */
  hint?: ReactNode;
  children: ReactNode | ((control: ControlProps) => ReactNode);
}) {
  const id = useId();
  const { formState } = useFormContext();
  const message: string | undefined = get(formState.errors, name)?.message;
  const describedBy = [hint ? `${id}-hint` : "", message ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined;
  const control: ControlProps = { id, "aria-invalid": !!message, "aria-describedby": describedBy };

  return (
    <div className="flex flex-col gap-1.5">
      {/* The id lets a group control (ChoiceChips) name itself with aria-labelledby={`${id}-label`}. */}
      <Label id={`${id}-label`} htmlFor={id}>
        {label}
        {optional && <span className="font-normal text-ink-muted"> (optional)</span>}
      </Label>
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-ink-muted">
          {hint}
        </p>
      )}
      {typeof children === "function" ? children(control) : <Slot.Root {...control}>{children}</Slot.Root>}
      {message && (
        <p id={`${id}-error`} className="text-sm text-danger">
          {message}
        </p>
      )}
    </div>
  );
}
