"use client";
import { useState } from "react";
import { toast } from "sonner";
import { DEFAULT_BRAND_COLOR, LOGO_RULES, brandColorProblem, logoProblem, type AccountOverview, type HeadingFont } from "@pedia/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BrandColorField, HeadingFontSelect, ImagePicker } from "@/features/clinic/components/brand-fields";
import { useSetBranding } from "../api";

/**
 * Billing #17–#20, A9: the finished design for a Design it for me clinic. One colour (checked, the palette derived),
 * a font from the shortlist, and the logo, needed the first time. Sending again corrects a delivery.
 */
export function SetBrandingDialog({ row, onClose }: { row: AccountOverview; onClose: () => void }) {
  const set = useSetBranding(row.account.id);
  const [logo, setLogo] = useState<File>();
  // Starts from the clinic's current look, so sending again changes only what the operator changes.
  const [color, setColor] = useState(row.look?.brandColor ?? DEFAULT_BRAND_COLOR);
  const [font, setFont] = useState<HeadingFont | null>(row.look?.headingFont ?? null);
  const [error, setError] = useState<string>();
  const delivered = row.design === "delivered";
  const hasLogo = !!row.look?.hasLogo; // the Owner may have removed it since

  function submit() {
    if (!logo && !(delivered && hasLogo)) return setError("Add the finished logo");
    if (!font) return setError("Choose the heading font");
    if (brandColorProblem(color)) return;
    setError(undefined);
    set.mutate(
      { input: { brandColor: color, headingFont: font }, logo },
      { onSuccess: () => { toast.success(`${row.account.name}'s look is delivered`); onClose(); }, onError: (e) => setError(e.message) },
    );
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Set branding for {row.account.name}</DialogTitle>
          <DialogDescription>The finished design. It replaces Primolar&apos;s look everywhere the clinic&apos;s staff and parents look.</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <ImagePicker
            id="design-logo"
            label="Logo"
            hint={delivered && hasLogo ? "Leave empty to keep the delivered logo. PNG, JPG or SVG, up to 1 MB." : "PNG, JPG or SVG, up to 1 MB."}
            accept={LOGO_RULES.types}
            max={1}
            files={logo ? [logo] : []}
            onChange={([f]) => setLogo(f)}
            problemOf={([f]) => (f ? logoProblem(f) : undefined)}
          />
          <BrandColorField id="design-color" value={color} onChange={setColor} fallback={DEFAULT_BRAND_COLOR} />
          <HeadingFontSelect id="design-font" value={font} onChange={setFont} allowDefault={false} />
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="button" onClick={submit} disabled={set.isPending}>{set.isPending ? "Saving" : delivered ? "Send again" : "Deliver branding"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
