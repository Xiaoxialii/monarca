"use client";

import { SignIn } from "@clerk/nextjs";
import { ArrowRight, ChevronDown } from "lucide-react";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getCopyLocale, getHtmlLang, useLocale, type CopyLocale } from "@/lib/locale";

const signInCopy = {
  en: {
    language: "English (United States)",
    help: "Help",
    privacy: "Privacy",
    terms: "Terms",
    emailLabel: "Email or phone",
    emailPlaceholder: "Email or phone",
    forgotEmail: "Forgot email?",
    note: "Not your computer? Use a private browsing window to sign in, This demo continues directly to the dashboard",
    createAccount: "Create account",
    next: "Next",
    brand: "Monarca AI",
    title: "Sign in",
    description: "Use your Monarca AI account to continue to the AI analytics dashboard"
  },
  zh: {
    language: "中文（简体）",
    help: "帮助",
    privacy: "隐私",
    terms: "条款",
    emailLabel: "邮箱或手机号",
    emailPlaceholder: "邮箱或手机号",
    forgotEmail: "忘记邮箱？",
    note: "这不是你的电脑？请使用无痕窗口登录当前演示会直接进入数据看板",
    createAccount: "创建账号",
    next: "下一步",
    brand: "蝴蝶效应",
    title: "登录",
    description: "使用你的蝴蝶效应账号继续访问 AI 数据分析工作区"
  }
} as const;

type SignInCopy = (typeof signInCopy)[CopyLocale];

export function SignInPanel() {
  const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const [locale] = useLocale("en");
  const copy = signInCopy[getCopyLocale(locale)];

  return (
    <main lang={getHtmlLang(locale)} className="flex min-h-screen flex-col bg-[#f8fafd] px-4 py-6 sm:px-6">
      <div className="flex flex-1 items-center justify-center">
        <section className="w-full max-w-[1040px] rounded-[28px] bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_20px_70px_rgba(16,24,40,0.08)] sm:p-10">
          {clerkKey ? <ClerkSignIn copy={copy} /> : <DemoSignIn copy={copy} />}
        </section>
      </div>

      <footer className="mx-auto mt-6 flex w-full max-w-[1040px] flex-col gap-4 px-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <button className="flex w-fit items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-white">
          {copy.language}
          <ChevronDown className="size-3" />
        </button>
        <div className="flex gap-5">
          <Link href="/" className="hover:text-foreground">
            {copy.help}
          </Link>
          <Link href="/" className="hover:text-foreground">
            {copy.privacy}
          </Link>
          <Link href="/" className="hover:text-foreground">
            {copy.terms}
          </Link>
        </div>
      </footer>
    </main>
  );
}

function ClerkSignIn({ copy }: { copy: SignInCopy }) {
  return (
    <div className="grid min-h-[500px] gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
      <SignInBrand copy={copy} />
      <div className="flex min-h-[420px] items-start justify-center pt-20 lg:pt-24">
        <SignIn
          routing="path"
          path="/sign-in"
          fallbackRedirectUrl="/dashboard"
          forceRedirectUrl="/dashboard"
          appearance={{
            elements: {
              rootBox: "w-full max-w-[520px]",
              cardBox: "w-full shadow-none border-0",
              card: "w-full shadow-none p-0",
              header: "hidden",
              socialButtonsBlockButton:
                "h-14 rounded-full border border-slate-400 bg-white text-base font-medium text-slate-700 shadow-[inset_0_1px_0_rgba(15,23,42,0.12),0_1px_2px_rgba(15,23,42,0.12)] hover:bg-slate-50",
              socialButtonsBlockButtonText: "text-base font-medium",
              socialButtonsProviderIcon: "size-6",
              formFieldInput: "h-14 rounded-md border-border text-base",
              formButtonPrimary: "rounded-full bg-primary px-6 hover:bg-primary/90 text-primary-foreground",
              footer: "hidden"
            }
          }}
        />
      </div>
    </div>
  );
}

function DemoSignIn({ copy }: { copy: SignInCopy }) {
  return (
    <div className="grid min-h-[420px] gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
      <SignInBrand copy={copy} />

      <div className="flex flex-col justify-between">
        <div className="space-y-8">
          <div className="space-y-2">
            <label className="sr-only" htmlFor="email">
              {copy.emailLabel}
            </label>
            <Input
              id="email"
              type="email"
              placeholder={copy.emailPlaceholder}
              defaultValue="demo@butterfly.ai"
              className="h-14 rounded-md text-base"
            />
          </div>

          <div className="space-y-3">
            <Button variant="ghost" className="h-auto px-0 text-sm font-medium text-teal-700 hover:bg-transparent hover:text-teal-800">
              {copy.forgotEmail}
            </Button>
            <p className="max-w-lg text-sm leading-6 text-muted-foreground">
              {copy.note}
            </p>
          </div>
        </div>

        <div className="mt-10 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
          <Button asChild variant="ghost" className="rounded-full px-5 text-teal-700 hover:bg-teal-50 hover:text-teal-800">
            <Link href="/sign-up">{copy.createAccount}</Link>
          </Button>
          <Button asChild className="rounded-full px-6">
            <Link href="/dashboard">
              {copy.next}
              <ArrowRight />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function SignInBrand({ copy }: { copy: SignInCopy }) {
  return (
    <div>
      <Link href="/" className="mb-8 flex w-fit items-center" aria-label={copy.brand}>
        <BrandLogo label={copy.brand} className="h-12" />
      </Link>
      <h1 className="text-4xl font-normal tracking-normal text-foreground sm:text-5xl">
        {copy.title}
      </h1>
      <p className="mt-5 text-base leading-7 text-foreground">
        {copy.description}
      </p>
    </div>
  );
}
