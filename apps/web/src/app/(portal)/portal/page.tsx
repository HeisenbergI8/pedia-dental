import { ComingSoon } from "@/components/coming-soon";

export default function PortalPage() {
  return (
    <main className="mx-auto max-w-3xl p-6">
      <ComingSoon
        title="Parent portal"
        covers={[
          "View and confirm appointments",
          "Request appointments",
          "View treatment plans and invoices",
          "Receive care instructions",
          "Upload medical documents and photos",
        ]}
      />
    </main>
  );
}
