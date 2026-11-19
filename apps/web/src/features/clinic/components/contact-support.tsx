"use client";
import { useState } from "react";
import { LifeBuoyIcon } from "lucide-react";
import { TIER_SUPPORT, type ClinicSupportView, type Tier } from "@pedia/shared";
import { Loading } from "@/components/brand";
import { ErrorState } from "@/components/error-state";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useClinicSupport } from "../api";

/**
 * D12: how this plan reaches Primolar. The channel is the tier's (TIER_SUPPORT); the addresses are the operator's data
 * (GET /clinic/support), never typed here. Addresses are shown as text too, since a mail link may not open.
 */
export function ContactSupport({ tier }: { tier: Tier }) {
  const [open, setOpen] = useState(false);
  const support = useClinicSupport(open);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <LifeBuoyIcon aria-hidden /> Contact support
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{TIER_SUPPORT[tier].label}</DialogTitle>
            <DialogDescription>{TIER_SUPPORT[tier].detail}</DialogDescription>
          </DialogHeader>
          {support.isLoading && <Loading label="Loading support details" />}
          {support.error && <ErrorState what="the support details" onRetry={() => void support.refetch()} />}
          {support.data && <Channel view={support.data} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Channel({ view }: { view: ClinicSupportView }) {
  const rows: [string, string, string?][] = [];
  if (view.contact) {
    rows.push(["Your contact", view.contact.name]);
    if (view.contact.phone) rows.push(["Phone", view.contact.phone, `tel:${view.contact.phone.replace(/[^\d+]/g, "")}`]);
    if (view.contact.email) rows.push(["Email", view.contact.email, `mailto:${view.contact.email}`]);
  }
  // Only an https link becomes clickable, whatever was stored before the rule (the schema refuses anything else).
  if (view.chatUrl && (view.channel === "chat" || !view.contact)) rows.push(["Chat", view.chatUrl, /^https:\/\//i.test(view.chatUrl) ? view.chatUrl : undefined]);
  if (view.email && (view.channel === "email" || !rows.length)) rows.push(["Email", view.email, `mailto:${view.email}`]);
  return (
    <div className="space-y-3 text-sm">
      {view.channel === "contact" && !view.contact && <p>Your Primolar contact is being assigned. Until then, reach us here.</p>}
      {rows.length === 0 ? (
        <p className="text-ink-muted">Primolar hasn&apos;t added its support details yet. Please try again later.</p>
      ) : (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
          {rows.map(([label, text, href]) => (
            <div key={label + text} className="contents">
              <dt className="text-ink-muted">{label}</dt>
              <dd className="break-all select-all">
                {href ? (
                  <a href={href} className="font-medium text-brand underline underline-offset-2" {...(href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}>
                    {text}
                  </a>
                ) : (
                  text
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
