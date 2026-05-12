"use client";

import { SignUp } from "@clerk/nextjs";
import { ArrowRight, ChevronDown, Eye, Sparkles } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocale, type Locale } from "@/lib/locale";

const signUpCopy = {
  en: {
    language: "English (United States)",
    help: "Help",
    privacy: "Privacy",
    terms: "Terms",
    firstName: "First name",
    lastName: "Last name",
    username: "Username",
    usernameHelp: "You can use letters, numbers, and periods.",
    password: "Password",
    confirm: "Confirm",
    showPassword: "Show password",
    passwordHelp: "Use 8 or more characters with a mix of letters, numbers, and symbols.",
    signInInstead: "Sign in instead",
    next: "Next",
    brand: "openAnalyst",
    title: "Create your account",
    description:
      "Start using openAnalyst to connect data, forecast growth, and ask questions across your business."
  },
  zh: {
    language: "中文（简体）",
    help: "帮助",
    privacy: "隐私",
    terms: "条款",
    firstName: "名",
    lastName: "姓",
    username: "用户名",
    usernameHelp: "你可以使用字母、数字和句点。",
    password: "密码",
    confirm: "确认密码",
    showPassword: "显示密码",
    passwordHelp: "请使用 8 个或更多字符，并混合字母、数字和符号。",
    signInInstead: "改为登录",
    next: "下一步",
    brand: "蝴蝶效应",
    title: "创建你的账号",
    description: "开始使用蝴蝶效应连接数据、预测增长，并向业务数据提问。"
  }
} as const;

type SignUpCopy = (typeof signUpCopy)[Locale];

export function SignUpPanel() {
  const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const [locale] = useLocale("en");
  const copy = signUpCopy[locale];

  return (
    <main lang={locale === "zh" ? "zh-CN" : "en"} className="flex min-h-screen flex-col bg-[#f8fafd] px-4 py-6 sm:px-6">
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
    <div className="grid min-h-[460px] gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:gap-20">
      <AccountBrand copy={copy} />
      <SignUp
        routing="path"
        path="/sign-up"
        fallbackRedirectUrl="/dashboard"
        appearance={{
          elements: {
            rootBox: "w-full",
            cardBox: "w-full shadow-none border-0",
            card: "w-full shadow-none p-0",
            header: "hidden",
            socialButtonsBlockButton: "rounded-full border-border",
            formFieldInput: "h-14 rounded-md border-border text-base",
            formButtonPrimary: "rounded-full bg-primary px-6 hover:bg-primary/90 text-primary-foreground",
            footer: "hidden"
          }
        }}
      />
    </div>
  );
}

function DemoSignUp({ copy }: { copy: SignUpCopy }) {
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
                type="password"
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
                type="password"
                placeholder={copy.confirm}
                className="h-[52px] rounded-md border-slate-300 bg-white text-base shadow-none focus-visible:ring-1"
              />
            </div>
          </div>

          <div className="flex items-start gap-3 px-1">
            <button className="mt-0.5 grid size-5 shrink-0 place-items-center rounded border border-slate-300 text-slate-500 hover:bg-slate-50" aria-label={copy.showPassword}>
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
      <Link href="/" className="mb-8 flex w-fit items-center gap-2">
        <div className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
          <Sparkles className="size-5" />
        </div>
        <span className="text-sm font-semibold">{copy.brand}</span>
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
