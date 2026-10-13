import { signupStatusLabel, type Signup } from "@pedia/shared";
import { Badge } from "@/components/ui/badge";

/** The state in words (A3); waiting-for-fee and rejected use the warning tokens with the word, never colour alone. */
export function SignupBadge({ signup }: { signup: Pick<Signup, "status" | "payment"> }) {
  const label = signupStatusLabel(signup);
  const warn = (signup.status === "waiting" && !signup.payment) || signup.status === "rejected";
  return warn ? (
    <Badge variant="outline" className="border-warning-line bg-warning-bg text-warning">{label}</Badge>
  ) : (
    <Badge variant="secondary">{label}</Badge>
  );
}
