import { notFound } from "next/navigation";
import LifetimeFinanceHub from "@/components/LifetimeFinanceHub";

export const dynamic = "force-dynamic";

export default function PreviewPage() {
  if (process.env.E2E_BYPASS_AUTH !== "1") notFound();
  return <LifetimeFinanceHub viewer={{ userId: "e2e-user", displayName: "Peter Parker", email: "peter@example.com" }} signOutPath="/login" />;
}
