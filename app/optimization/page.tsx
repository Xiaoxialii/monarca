import { Dashboard } from "@/components/dashboard";
import { syncCurrentClerkUserIdentity } from "@/lib/clerk-user-sync";
import { getRequestLocale } from "@/lib/server-locale";
import { redirect } from "next/navigation";

export default async function OptimizationPage() {
  const identity = await syncCurrentClerkUserIdentity();

  if (!identity) {
    redirect("/sign-in");
  }

  if (identity.user.productAccessEnabled !== true) {
    redirect("/access-pending");
  }

  return <Dashboard view="reports" defaultLocale={await getRequestLocale("en")} />;
}
