"use client";
import { useEffect, useRef, useState } from "react";
import { CameraIcon, ImageIcon } from "lucide-react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { z } from "zod";
import { IsoDate, PhotoType, isValidTooth } from "@pedia/shared";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCurrentVisit, useVisits } from "@/features/visits/api";
import { useUploadPhoto } from "../api";

export const TYPE_LABEL: Record<PhotoType, string> = {
  intraoral: "Intraoral",
  extraoral: "Extraoral",
  xray: "X-ray",
  referral: "Referral document",
  document: "Medical document",
};

const NONE = "none"; // Radix Select can't hold an empty value

const FormValues = z.object({
  file: z.instanceof(File, { message: "Choose or take a photo" }),
  type: PhotoType,
  stage: z.enum([NONE, "before", "after"]),
  tooth: z.string().refine((t) => t === "" || isValidTooth(Number(t)), "Use an FDI number, e.g. 74"),
  visitId: z.string(),
  takenOn: IsoDate,
  caption: z.string(),
});
type FormValues = z.infer<typeof FormValues>;

export function UploadPhotoDialog({ patientId }: { patientId: string }) {
  const [open, setOpen] = useState(false);
  const visits = useVisits(patientId);
  const current = useCurrentVisit(patientId);
  const upload = useUploadPhoto(patientId);
  const form = useForm<FormValues>({ resolver: zodResolver(FormValues) });

  function onOpenChange(next: boolean) {
    // Fresh defaults each time, so a visit started since last time is picked up.
    if (next) {
      form.reset({
        type: "intraoral",
        stage: NONE,
        tooth: "",
        visitId: current?.id ?? NONE,
        takenOn: format(new Date(), "yyyy-MM-dd"),
        caption: "",
      });
    }
    setOpen(next);
  }

  function onSubmit({ file, stage, tooth, visitId, ...rest }: FormValues) {
    upload.mutate(
      {
        ...rest,
        file,
        stage: stage === NONE ? undefined : stage,
        tooth: tooth ? Number(tooth) : undefined,
        visitId: visitId === NONE ? undefined : visitId,
      },
      {
        onSuccess: () => {
          toast.success("Photo saved");
          setOpen(false);
        },
        onError: (e) => toast.error(e.message),
      },
    );
  }

  const select = (name: "type" | "stage" | "visitId", options: [string, string][], props: object) => (
    <Controller
      control={form.control}
      name={name}
      render={({ field }) => (
        <Select value={field.value} onValueChange={field.onChange}>
          <SelectTrigger {...props} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    />
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button>Add photo</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add photo</DialogTitle>
          <DialogDescription>Take one with the camera or upload a file. It is resized before saving.</DialogDescription>
        </DialogHeader>
        <FormProvider {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
            <FormField name="file" label="Photo">
              {(props) => (
                <Controller
                  control={form.control}
                  name="file"
                  render={({ field }) => <PhotoPicker controlProps={props} value={field.value} onChange={field.onChange} />}
                />
              )}
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField name="type" label="Type">
                {(props) => select("type", PhotoType.options.map((t) => [t, TYPE_LABEL[t]]), props)}
              </FormField>
              <FormField name="stage" label="Before or after">
                {(props) => select("stage", [[NONE, "Neither"], ["before", "Before"], ["after", "After"]], props)}
              </FormField>
              <FormField name="tooth" label="Tooth (optional)">
                <Input inputMode="numeric" placeholder="e.g. 74" {...form.register("tooth")} />
              </FormField>
              <FormField name="takenOn" label="Taken on">
                <Input type="date" {...form.register("takenOn")} />
              </FormField>
            </div>
            <FormField name="visitId" label="Visit">
              {(props) =>
                select("visitId", [
                  [NONE, "Not linked to a visit"],
                  ...(visits.data ?? []).map((v): [string, string] => [
                    v.id,
                    `${format(parseISO(v.date), "MMM d, yyyy")}${v.status === "in_progress" ? " (current)" : ""}`,
                  ]),
                ], props)
              }
            </FormField>
            <FormField name="caption" label="Caption (optional)">
              <Input {...form.register("caption")} />
            </FormField>
            <DialogFooter>
              <Button type="submit" disabled={upload.isPending}>
                {upload.isPending ? "Saving" : "Save photo"}
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Two buttons, not one input: with `capture`, a phone opens only the camera and hides the library. The chosen
 * file shows as a thumbnail with its own name, never a hashed one.
 */
function PhotoPicker({
  controlProps,
  value,
  onChange,
}: {
  controlProps: { id: string; "aria-invalid": boolean; "aria-describedby"?: string };
  value: File | undefined;
  onChange: (file: File | undefined) => void;
}) {
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string>();
  useEffect(() => {
    if (!value) return setPreview(undefined);
    const url = URL.createObjectURL(value);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.files?.[0]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button {...controlProps} type="button" variant="outline" onClick={() => camera.current?.click()}>
          <CameraIcon aria-hidden /> Take photo
        </Button>
        <Button type="button" variant="outline" onClick={() => library.current?.click()}>
          <ImageIcon aria-hidden /> Choose file
        </Button>
      </div>
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={pick} />
      <input ref={library} type="file" accept="image/*" hidden onChange={pick} />
      {value && (
        <p className="flex items-center gap-3 text-sm text-ink-muted">
          {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL, not a static asset */}
          {preview && <img src={preview} alt="" className="size-12 rounded-md bg-photo-backdrop object-cover" />}
          <span className="min-w-0 break-all">{value.name}</span>
        </p>
      )}
    </div>
  );
}
