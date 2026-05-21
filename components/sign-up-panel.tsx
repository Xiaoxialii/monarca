"use client";

import { SignUp } from "@clerk/nextjs";
import { ArrowRight, ChevronDown, Eye } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getCopyLocale, getHtmlLang, useLocale, type CopyLocale } from "@/lib/locale";

const signUpCopy = {
  en: {
    language: "English (United States)",
    help: "Help",
    privacy: "Privacy",
    terms: "Terms",
    firstName: "First name",
    lastName: "Last name",
    username: "Username",
    usernameHelp: "You can use letters, numbers, and periods",
    password: "Password",
    confirm: "Confirm",
    showPassword: "Show password",
    passwordHelp: "Use 8 or more characters with a mix of letters, numbers, and symbols",
    signInInstead: "Sign in instead",
    next: "Next",
    brand: "Monarca AI",
    title: "Create your account",
    description:
      "Start using Monarca AI to connect data, forecast growth, and ask questions across your business"
  },
  zh: {
    language: "中文（简体）",
    help: "帮助",
    privacy: "隐私",
    terms: "条款",
    firstName: "名",
    lastName: "姓",
    username: "用户名",
    usernameHelp: "你可以使用字母、数字和句点",
    password: "密码",
    confirm: "确认密码",
    showPassword: "显示密码",
    passwordHelp: "请使用 8 个或更多字符，并混合字母、数字和符号",
    signInInstead: "改为登录",
    next: "下一步",
    brand: "蝴蝶效应",
    title: "创建你的账号",
    description: "开始使用蝴蝶效应连接数据、预测增长，并向业务数据提问"
  }
} as const;

type SignUpCopy = (typeof signUpCopy)[CopyLocale];

export function SignUpPanel() {
  const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const [locale] = useLocale("en");
  const copy = signUpCopy[getCopyLocale(locale)];

  return (
    <main lang={getHtmlLang(locale)} className="flex min-h-screen flex-col bg-[#f8fafd] px-4 py-6 sm:px-6">
      <div className="flex flex-1 items-center justify-center">
        <section className="w-full max-w-[1040px] rounded-[28px] bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_20px_70px_rgba(16,24,40,0.08)] sm:p-10 lg:p-12">
          {clerkKey ? <ClerkSignUp copy={copy} /> : <DemoSignUp copy={copy} />}
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

function ClerkSignUp({ copy }: { copy: SignUpCopy }) {
  return (
    <div className="grid min-h-[560px] gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
      <AccountBrand copy={copy} />
      <div className="flex min-h-[460px] items-start justify-center pt-12 lg:pt-16">
        <SignUp
          routing="path"
          path="/sign-up"
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

function DemoSignUp({ copy }: { copy: SignUpCopy }) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="grid min-h-[460px] gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
      <AccountBrand copy={copy} />

      <div className="flex flex-col justify-between">
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="sr-only" htmlFor="first-name">
                {copy.firstName}
              </label>
              <Input
                id="first-name"
                placeholder={copy.firstName}
                className="h-[52px] rounded-md border-slate-300 bg-white text-base shadow-none focus-visible:ring-1"
              />
            </div>
            <div className="space-y-2">
              <label className="sr-only" htmlFor="last-name">
                {copy.lastName}
              </label>
              <Input
                id="last-name"
                placeholder={copy.lastName}
                className="h-[52px] rounded-md border-slate-300 bg-white text-base shadow-none focus-visible:ring-1"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="sr-only" htmlFor="username">
              {copy.username}
            </label>
            <Input
              id="username"
              placeholder={copy.username}
              className="h-[52px] rounded-md border-slate-300 bg-white text-base shadow-none focus-visible:ring-1"
            />
            <p className="px-1 text-xs leading-5 text-slate-500">
              {copy.usernameHelp}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="sr-only" htmlFor="password">
                {copy.password}
              </label>
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder={copy.password}
                className="h-[52px] rounded-md border-slate-300 bg-white text-base shadow-none focus-visible:ring-1"
              />
            </div>
            <div className="space-y-2">
              <label className="sr-only" htmlFor="confirm-password">
                {copy.confirm}
              </label>
              <Input
                id="confirm-password"
                type={showPassword ? "text" : "password"}
                placeholder={copy.confirm}
                className="h-[52px] rounded-md border-slate-300 bg-white text-base shadow-none focus-visible:ring-1"
              />
            </div>
          </div>

          <div className="flex items-start gap-3 px-1">
            <button
              type="button"
              aria-label={copy.showPassword}
              aria-pressed={showPassword}
              onClick={() => setShowPassword((current) => !current)}
              className="mt-0.5 grid size-5 shrink-0 place-items-center rounded border border-slate-300 text-slate-500 transition hover:bg-slate-50 aria-pressed:border-emerald-700 aria-pressed:bg-emerald-50 aria-pressed:text-emerald-800"
            >
              <Eye className="size-3.5" />
            </button>
            <p className="max-w-lg text-sm leading-6 text-slate-500">
              {copy.passwordHelp}
            </p>
          </div>
        </div>

        <div className="mt-10 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Button asChild variant="ghost" className="rounded-full px-5 text-teal-700 hover:bg-teal-50 hover:text-teal-800">
            <Link href="/sign-in">{copy.signInInstead}</Link>
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

function AccountBrand({ copy }: { copy: SignUpCopy }) {
  return (
    <div>
      <Link href="/" className="mb-8 flex w-fit items-center" aria-label={copy.brand}>
        <BrandLogo label={copy.brand} className="h-12" />
      </Link>
      <h1 className="max-w-sm text-4xl font-normal tracking-normal text-foreground sm:text-5xl">
        {copy.title}
      </h1>
      <p className="mt-5 max-w-sm text-base leading-7 text-foreground">
        {copy.description}
      </p>
    </div>
  );
}
