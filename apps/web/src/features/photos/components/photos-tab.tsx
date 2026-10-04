"use client";
// Plain <img>: next/image optimises on the server, which can't reach files that live in the browser (mock)
// or behind the API's auth (later).
/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import { format, parseISO } from "date-fns";
import { CameraIcon } from "lucide-react";
import { PhotoType, type ClinicalPhoto } from "@pedia/shared";
import { Segmented } from "@/components/segmented";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Can } from "@/features/auth/access";
import { useStaff } from "@/features/clinic/api";
import { useVisits } from "@/features/visits/api";
import { photoFileUrl, usePhotos } from "../api";
import { TYPE_LABEL, UploadPhotoDialog } from "./upload-photo-dialog";
import { Loading } from "@/components/brand";
import { ErrorState } from "@/components/error-state";

const describe = (p: ClinicalPhoto) =>
  [TYPE_LABEL[p.type], p.stage, p.tooth && `tooth ${p.tooth}`, format(parseISO(p.takenOn), "MMM d, yyyy")]
    .filter(Boolean)
    .join(" · ");

function BeforeAfter({ before, after }: { before: ClinicalPhoto; after: ClinicalPhoto }) {
  const [split, setSplit] = useState(50);
  const [mode, setMode] = useState<"slider" | "side">("slider");
  return (
    <div className="max-w-3xl space-y-3">
      <Segmented
        label="Comparison layout"
        value={mode}
        onChange={setMode}
        options={[
          { value: "slider", label: "Slider" },
          { value: "side", label: "Side by side" },
        ]}
      />
      {mode === "side" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[before, after].map((p) => (
            <figure key={p.id} className="space-y-1">
              <img src={photoFileUrl(p.id)} alt={describe(p)} className="aspect-[4/3] w-full rounded-md bg-photo-backdrop object-contain" />
              <figcaption className="text-sm text-ink-muted">{describe(p)}</figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <figure className="space-y-2">
          <div className="relative aspect-[4/3] overflow-hidden rounded-md bg-photo-backdrop select-none">
            <img src={photoFileUrl(after.id)} alt={describe(after)} className="absolute inset-0 size-full object-contain" />
            <img
              src={photoFileUrl(before.id)}
              alt={describe(before)}
              className="absolute inset-0 size-full object-contain"
              style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
            />
            <div aria-hidden className="absolute inset-y-0 w-0.5 bg-paper" style={{ left: `${split}%` }} />
            <span className="absolute top-2 left-2 rounded bg-surface/90 px-2 py-0.5 text-sm font-medium text-ink">Before</span>
            <span className="absolute top-2 right-2 rounded bg-surface/90 px-2 py-0.5 text-sm font-medium text-ink">After</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={split}
            onChange={(e) => setSplit(Number(e.target.value))}
            aria-label="Before and after split"
            className="w-full accent-brand"
          />
          <figcaption className="text-sm text-ink-muted">
            Before: {describe(before)}. After: {describe(after)}.
          </figcaption>
        </figure>
      )}
    </div>
  );
}

export function PhotosTab({ patientId }: { patientId: string }) {
  const { data: photos, isLoading, error, refetch, isRefetching } = usePhotos(patientId);
  const visits = useVisits(patientId);
  const staff = useStaff();
  const [tooth, setTooth] = useState<string>();

  // Teeth with both a before and an after photo. Photos arrive newest first, so the first match is the latest.
  const pairs = new Map<number, { before?: ClinicalPhoto; after?: ClinicalPhoto }>();
  for (const p of photos ?? []) {
    if (!p.tooth || !p.stage) continue;
    const pair = pairs.get(p.tooth) ?? {};
    pair[p.stage] ??= p;
    pairs.set(p.tooth, pair);
  }
  const comparable = [...pairs].filter(([, pair]) => pair.before && pair.after).map(([t]) => t);
  const shown = tooth && comparable.includes(Number(tooth)) ? Number(tooth) : comparable[0];
  const pair = shown ? pairs.get(shown) : undefined;

  // patient → visit → type. Photos with no visit form their own group at the end.
  const byVisit = new Map<string, ClinicalPhoto[]>();
  for (const p of photos ?? []) byVisit.set(p.visitId ?? "", [...(byVisit.get(p.visitId ?? "") ?? []), p]);
  const groups = [...byVisit].sort(([a], [b]) => Number(a === "") - Number(b === ""));
  const visitLabel = (visitId: string) => {
    const v = visits.data?.find((x) => x.id === visitId);
    if (!v) return "Not linked to a visit";
    const dentist = staff.data?.find((s) => s.id === v.dentistId)?.fullName;
    return `Visit ${format(parseISO(v.date), "MMM d, yyyy")}${dentist ? ` · ${dentist}` : ""}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Clinical photos</h2>
        <Can permission="clinical.write">
          <UploadPhotoDialog patientId={patientId} />
        </Can>
      </div>
      {isLoading && <Loading label="Loading photos…" />}
      {error && <ErrorState what="the photos" onRetry={() => refetch()} retrying={isRefetching} />}
      {photos?.length === 0 && (
        <EmptyState icon={CameraIcon} title="No photos yet">
          Intraoral photos and X-rays taken at a visit appear here, grouped by visit.
        </EmptyState>
      )}

      {pair?.before && pair.after && (
        <section className="space-y-3 rounded-xl border border-line bg-surface p-4 shadow-card sm:p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h3 className="font-semibold">Before and after</h3>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="compare-tooth">Tooth</Label>
              <Select value={String(shown)} onValueChange={setTooth}>
                <SelectTrigger id="compare-tooth" className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {comparable.map((t) => (
                    <SelectItem key={t} value={String(t)}>Tooth {t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <BeforeAfter key={shown} before={pair.before} after={pair.after} />
        </section>
      )}

      {groups.map(([visitId, inVisit]) => (
        <section key={visitId} className="space-y-4 rounded-xl border border-line bg-surface p-4 shadow-card sm:p-5">
          <h3 className="font-semibold">{visitLabel(visitId)}</h3>
          {PhotoType.options
            .filter((t) => inVisit.some((p) => p.type === t))
            .map((t) => (
              <div key={t} className="space-y-2">
                <p className="text-sm text-ink-muted">{TYPE_LABEL[t]}</p>
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {inVisit
                    .filter((p) => p.type === t)
                    .map((p) => (
                      <li key={p.id}>
                        <a href={photoFileUrl(p.id)} target="_blank" rel="noreferrer" className="block">
                          <img
                            src={photoFileUrl(p.id)}
                            alt={describe(p)}
                            loading="lazy"
                            className="aspect-square w-full rounded-md bg-ground object-cover"
                          />
                        </a>
                        <p className="mt-1 text-sm">
                          {p.stage && <Badge variant="outline" className="mr-1 capitalize">{p.stage}</Badge>}
                          {p.tooth && <span className="font-medium">Tooth {p.tooth} · </span>}
                          <span className="text-ink-muted">{format(parseISO(p.takenOn), "MMM d")}</span>
                        </p>
                        {p.caption && <p className="text-sm text-ink-muted">{p.caption}</p>}
                      </li>
                    ))}
                </ul>
              </div>
            ))}
        </section>
      ))}
    </div>
  );
}
