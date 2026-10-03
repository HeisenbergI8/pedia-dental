import { SmileIcon } from "lucide-react";
import { ComingSoon } from "@/components/coming-soon";

export default function PortalPage() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-16 max-w-3xl items-center gap-2.5 px-4 sm:px-6">
          <span className="flex size-9 items-center justify-center rounded-full bg-brand text-brand-ink">
            <SmileIcon className="size-5" aria-hidden />
          </span>
          <span className="text-lg font-semibold">Pedia Dental</span>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <ComingSoon
          title="Parent portal"
          description="Hello! This is where you'll look after your child's visits."
          covers={[
            "View and confirm appointments",
            "Request appointments",
            "View treatment plans and invoices",
            "Receive care instructions",
            "Upload medical documents and photos",
          ]}
        />
      </main>
    </div>
  );
}
