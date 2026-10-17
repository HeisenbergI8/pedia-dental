"use client";
import { useState } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import type { UseFormRegisterReturn } from "react-hook-form";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** A password box with Show / Hide: a parent typing on a phone checks what they typed (B11). */
export function PasswordField({ name, label, hint, autoComplete, register }: { name: string; label: string; hint?: string; autoComplete: string; register: UseFormRegisterReturn }) {
  const [shown, setShown] = useState(false);
  return (
    <FormField name={name} label={label} hint={hint}>
      {(control) => (
        <div className="relative">
          <Input {...control} type={shown ? "text" : "password"} autoComplete={autoComplete} className="pr-11" {...register} />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={shown ? "Hide password" : "Show password"}
            aria-pressed={shown}
            onClick={() => setShown((v) => !v)}
            className="absolute inset-y-0 right-0 h-full text-ink-muted hover:bg-transparent hover:text-ink-muted dark:hover:bg-transparent"
          >
            {shown ? <EyeOffIcon /> : <EyeIcon />}
          </Button>
        </div>
      )}
    </FormField>
  );
}
