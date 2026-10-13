import Link from "next/link";
import { cn } from "@/lib/utils";

const link = "font-medium text-ink-muted underline underline-offset-2 hover:text-ink";

/**
 * "Privacy" and "Terms" wherever a stranger lands (ROADMAP 18): sign-in, Get started and every legal page. In the
 * portal (`clinicId`), the clinic's own notice and Primolar's policy (P22).
 */
export function LegalLinks({ clinicId, className }: { clinicId?: string; className?: string }) {
  return (
    <nav aria-label="Privacy and terms" className={cn("flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm", className)}>
      {clinicId && (
        <Link href={`/legal/notice/${clinicId}`} className={link}>
          Clinic privacy notice
        </Link>
      )}
      <Link href="/legal/privacy" className={link}>
        {clinicId ? "Primolar privacy policy" : "Privacy"}
      </Link>
      {!clinicId && (
        <Link href="/legal/terms" className={link}>
          Terms
        </Link>
      )}
    </nav>
  );
}
