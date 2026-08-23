import { redirect } from "next/navigation";
import { syncCurrentClerkUserIdentity } from "@/lib/clerk-user-sync";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const identity = await syncCurrentClerkUserIdentity();

  if (!identity) {
    redirect("/sign-in");
  }

  if (identity.user.productAccessEnabled !== true) {
    redirect("/access-pending");
  }

  return children;
}
