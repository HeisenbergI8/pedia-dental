"use client";
import { Controller, useFormContext } from "react-hook-form";
import { UpfrontMethod } from "@pedia/shared";
import { FormField } from "@/components/form-field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { METHOD_LABEL } from "@/features/billing/api";

/**
 * The upfront payment marked by hand (billing #3, #24, A4): method, reference and date. In Record payment the fields
 * sit at the form's root; in New clinic account under `payment.` (billing #16). Untyped paths, as OpeningHoursFields.
 */
export function PaymentFields({ prefix = "" }: { prefix?: "" | "payment." }) {
  const { control, register } = useFormContext();
  return (
    <>
      <FormField name={`${prefix}method`} label="Paid by">
        {(props) => (
          <Controller
            control={control}
            name={`${prefix}method`}
            render={({ field }) => (
              <Select value={field.value as string} onValueChange={field.onChange}>
                <SelectTrigger {...props} className="w-full sm:w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UpfrontMethod.options.map((m) => (
                    <SelectItem key={m} value={m}>{METHOD_LABEL[m]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        )}
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField name={`${prefix}reference`} label="Reference (optional)" hint="The transfer or GCash reference">
          <Input autoComplete="off" {...register(`${prefix}reference`)} />
        </FormField>
        <FormField name={`${prefix}paidOn`} label="Paid on">
          <Input type="date" {...register(`${prefix}paidOn`)} />
        </FormField>
      </div>
    </>
  );
}
