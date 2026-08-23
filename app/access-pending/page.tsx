import Link from "next/link";
import { redirect } from "next/navigation";
import { SignOutButton } from "@clerk/nextjs";
import { ArrowRight, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
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
        <div className="w-full rounded-[28px] border border-slate-200 bg-white p-8 shadow-[0_24px_80px_rgba(15,23,42,0.08)] sm:p-10">
          <div className="mb-8 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
            <ArrowRight className="h-5 w-5" />
          </div>
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
            Your account is awaiting approval
          </h1>
          <p className="mt-5 text-lg font-semibold leading-8 text-slate-600">
            Monarca is currently available to approved ecommerce teams. Please contact the Monarca AI team to request access.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Button asChild className="rounded-full bg-slate-950 px-7 text-white hover:bg-slate-800">
              <Link href="/consulting">
                Contact Monarca AI
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <SignOutButton redirectUrl="/">
              <Button type="button" variant="outline" className="rounded-full px-7">
                <LogOut className="h-4 w-4" />
                Sign out
              </Button>
            </SignOutButton>
          </div>
        </div>
      </section>
    </main>
  );
}
