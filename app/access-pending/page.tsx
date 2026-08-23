import { redirect } from "next/navigation";
import { AccessApprovalCard } from "@/components/access-approval-card";
import { syncCurrentClerkUserIdentity } from "@/lib/clerk-user-sync";

export const dynamic = "force-dynamic";

export default async function AccessPendingPage() {
  const identity = await syncCurrentClerkUserIdentity();

  if (!identity) {
    redirect("/sign-in");
  }

  if (identity.user.productAccessEnabled === true) {
    redirect("/optimization");
  }

  return (
    <main className="min-h-screen bg-[#e7ebe8] px-6 py-10 text-slate-950">
      <section className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-2xl items-center justify-center">
        <AccessApprovalCard showSignOut />
      </section>
    </main>
  );
}
