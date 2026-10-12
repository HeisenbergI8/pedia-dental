"use client";
import { useForm, FormProvider, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format, parseISO } from "date-fns";
import { UploadIcon } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { FormField } from "@/components/form-field";
import { EmptyState } from "@/components/empty-state";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { isPdf, uploadProblem } from "@pedia/shared";
import { photoFileUrl, usePhotos, useUploadPhoto } from "@/features/photos/api";
import { FileCard } from "@/features/photos/components/file-card";
import { Can } from "@/features/auth/access";
import { useActiveChild } from "../use-child";
import { Loading } from "@/components/brand";
import { ErrorState } from "@/components/error-state";

const KIND = { document: "Medical document (clearance, lab result)", intraoral: "Photo of teeth or mouth" } as const;
const UploadForm = z.object({
  file: z.instanceof(File, { message: "Choose a photo or a PDF" }),
  type: z.enum(["document", "intraoral"]),
  caption: z.string().trim().min(1, "Say what this is, like “Medical clearance from Dr. Cruz”").max(200, "Keep it under 200 characters"),
}).superRefine((v, ctx) => {
  // The server's rule: a medical document may be a PDF, a photo of the teeth must be an image.
  const why = uploadProblem(v.type, v.file);
  if (why) ctx.addIssue({ code: "custom", message: why, path: ["file"] });
});
type UploadForm = z.infer<typeof UploadForm>;

export function PortalUploads() {
  const child = useActiveChild();
  const { data: files = [], isLoading, error, refetch, isRefetching } = usePhotos(child.id);
  const upload = useUploadPhoto(child.id);
  const form = useForm<UploadForm>({ resolver: zodResolver(UploadForm), defaultValues: { type: "document", caption: "" } });

  const onSubmit = (v: UploadForm) =>
    upload.mutate(
      { file: v.file, type: v.type, caption: v.caption, takenOn: format(new Date(), "yyyy-MM-dd") },
      {
        onSuccess: () => {
          toast.success("Uploaded. The clinic can see it now.");
          form.reset({ type: v.type, caption: "" });
        },
        onError: (e) => toast.error(e.message),
      },
    );

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Uploads for {child.firstName}</h1>
      <Can permission="uploads.create">
        <SectionCard title="Send the clinic a file" description="Only you and the clinic's staff can see what you upload.">
          <FormProvider {...form}>
            <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="max-w-md space-y-4">
              <FormField name="type" label="What are you sending?">
                {(control) => (
                  <Controller
                    name="type"
                    control={form.control}
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger {...control} className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(KIND).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                  />
                )}
              </FormField>
              <FormField name="file" label="Photo or PDF">
                {(control) => (
                  <Controller
                    name="file"
                    control={form.control}
                    render={({ field }) => (
                      <Input {...control} type="file" accept="image/*,application/pdf" onChange={(e) => field.onChange(e.target.files?.[0])} />
                    )}
                  />
                )}
              </FormField>
              <FormField name="caption" label="Description">
                <Input {...form.register("caption")} />
              </FormField>
              <Button type="submit" className="min-h-11" disabled={upload.isPending}>{upload.isPending ? "Uploading" : "Upload"}</Button>
            </form>
          </FormProvider>
        </SectionCard>
      </Can>

      {isLoading ? <Loading label="Loading uploads" /> : error ? (
        <ErrorState what="your uploads" onRetry={() => refetch()} retrying={isRefetching} />
      ) : files.length === 0 ? (
        <EmptyState tone="warm" icon={UploadIcon} title="Nothing uploaded yet">Photos and documents you send will show here.</EmptyState>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {files.map((f) => (
            <li key={f.id} className="space-y-1.5">
              {isPdf(f.contentType) ? (
                <FileCard photo={f} label="Medical document" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- served by the mock API, not a static asset
                <img src={photoFileUrl(f.id)} alt={f.caption || "Upload"} className="aspect-square w-full rounded-lg border border-line object-cover" />
              )}
              <p className="text-sm font-medium">{f.caption}</p>
              <p className="text-xs text-ink-muted">{format(parseISO(f.createdAt), "MMMM d, yyyy")}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
