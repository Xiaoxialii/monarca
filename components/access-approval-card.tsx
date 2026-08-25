"use client";

import { SignOutButton } from "@clerk/nextjs";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

type AccessApprovalCardProps = {
  locale?: "en" | "zh";
  showSignOut?: boolean;
};

const copy = {
  en: {
    title: "Data connection access is not enabled",
    description:
      "Your account can sign in and use Monarca, but data-source connection requires approval. Please contact the Monarca AI team to enable data access.",
    signOut: "Sign out"
  },
  zh: {
    title: "暂未开通数据接入权限",
    description: "你可以注册、登录并使用 Monarca，但连接数据源需要单独开通权限。请联系 Monarca AI 团队开通数据接入权限。",
    signOut: "退出登录"
  }
} as const;

export function AccessApprovalCard({ locale = "en", showSignOut = false }: AccessApprovalCardProps) {
  const text = copy[locale];

  return (
    <div className="mx-auto w-full max-w-[560px] rounded-[28px] border border-slate-200 bg-white p-8 text-center shadow-[0_24px_80px_rgba(15,23,42,0.08)] sm:p-10">
      <div className="mx-auto mb-7 flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-100 bg-emerald-50">
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-600 shadow-[0_0_0_8px_rgba(5,150,105,0.12)]" />
      </div>
      <h1 className="text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">{text.title}</h1>
      <p className="mt-5 text-lg font-semibold leading-8 text-slate-600">{text.description}</p>
      {showSignOut ? (
        <div className="mt-8 flex justify-center">
          <SignOutButton redirectUrl="/">
            <Button type="button" variant="outline" className="rounded-full px-7">
              <LogOut className="h-4 w-4" />
              {text.signOut}
            </Button>
          </SignOutButton>
        </div>
      ) : null}
    </div>
  );
}
