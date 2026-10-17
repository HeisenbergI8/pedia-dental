import { FileTextIcon } from "lucide-react";
import type { ClinicalPhoto } from "@pedia/shared";
import { photoFileUrl } from "../api";

/** A PDF in a photo grid: an icon, its caption, Open (new tab) and Download. Never an <img>. */
export function FileCard({ photo, label }: { photo: Pick<ClinicalPhoto, "id" | "caption">; label: string }) {
  const href = photoFileUrl(photo.id);
  return (
    <div className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-md border border-line bg-surface p-3 text-center">
      <FileTextIcon className="size-8 text-ink-muted" aria-hidden />
      <span className="line-clamp-2 max-w-full text-sm wrap-anywhere">{photo.caption || label}</span>
      <span className="flex gap-3 text-sm">
        <a href={href} target="_blank" rel="noreferrer" className="text-brand underline-offset-2 hover:underline">Open</a>
        <a href={photoFileUrl(photo.id, { download: true })} download className="text-brand underline-offset-2 hover:underline">Download</a>
      </span>
    </div>
  );
}
