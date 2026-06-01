"use client";

import { ArrowRight, CheckCircle2, Home } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { getCopyLocale, useLocale } from "@/lib/locale";

const successCopy = {
  en: {
    eyebrow: "Payment successful",
    title: "Your plan is active",
    body: "Stripe has confirmed your payment. You can now return to your workspace and continue setting up Monarca AI.",
    dashboard: "Go to dashboard",
    home: "Back to homepage",
    session: "Checkout session",
    plans: {
      trial: "One-time trial",
      "database-setup": "Database setup",
      professional: "Professional plan"
    }
  },
  zh: {
    eyebrow: "付款成功",
    title: "付费成功",
    body: "Stripe 已确认本次付款。你现在可以返回工作台，继续连接数据并使用 Monarca AI。",
    dashboard: "返回 Dashboard",
    home: "返回主页",
    session: "付款编号",
    plans: {
      trial: "单次体验",
      "database-setup": "数据库搭建",
      professional: "专业版套餐"
    }
  }
};

type PaidPlan = keyof typeof successCopy.en.plans;

function isPaidPlan(plan: string | null): plan is PaidPlan {
  return plan === "trial" || plan === "database-setup" || plan === "professional";
}

function CheckoutSuccessContent() {
  const searchParams = useSearchParams();
  const [locale] = useLocale("zh");
  const copy = successCopy[getCopyLocale(locale)];
  const plan = searchParams?.get("plan") ?? null;
  const sessionId = searchParams?.get("session_id") ?? null;
  const planLabel = isPaidPlan(plan) ? copy.plans[plan] : copy.plans.professional;

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-10">
      <section className="w-full max-w-[520px] rounded-lg border border-slate-200 bg-white px-6 py-8 text-center shadow-[0_18px_60px_rgba(15,23,42,0.08)] sm:px-10 sm:py-10">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <CheckCircle2 className="size-8" aria-hidden="true" />
        </div>

        <p className="mt-6 text-sm font-medium text-emerald-700">{copy.eyebrow}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-normal text-slate-950 sm:text-4xl">
          {copy.title}
        </h1>
        <p className="mx-auto mt-4 max-w-[420px] text-sm leading-6 text-slate-600">{copy.body}</p>

        <div className="mt-6 rounded-md border border-slate-100 bg-slate-50 px-4 py-3 text-left">
          <div className="flex items-center justify-between gap-4 text-sm">
            <span className="text-slate-500">{planLabel}</span>
            {sessionId ? (
              <span className="max-w-[180px] truncate font-mono text-xs text-slate-400" title={sessionId}>
                {copy.session}: {sessionId}
              </span>
            ) : null}
          </div>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <Button asChild className="h-11 bg-slate-950 text-white hover:bg-slate-800">
            <Link href="/dashboard">
              {copy.dashboard}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-11 border-slate-200 bg-white text-slate-700">
            <Link href="/">
              <Home className="size-4" aria-hidden="true" />
              {copy.home}
            </Link>
          </Button>
        </div>
      </section>
    </main>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={null}>
      <CheckoutSuccessContent />
    </Suspense>
  );
}
