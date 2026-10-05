import type { PatientView } from "@pedia/shared";
import { Skeleton } from "@/components/ui/skeleton";

/** "Lastname, Firstname". A placeholder bar while the list loads, never a made-up name; "Unknown patient" if absent. */
export function PatientName({ patient, loading }: { patient?: Pick<PatientView, "firstName" | "lastName">; loading: boolean }) {
  if (patient) return <>{`${patient.lastName}, ${patient.firstName}`}</>;
  if (loading) {
    return (
      <>
        <Skeleton className="inline-block h-4 w-28 align-middle" aria-hidden />
        <span className="sr-only">Loading name</span>
      </>
    );
  }
  return <>Unknown patient</>;
}
