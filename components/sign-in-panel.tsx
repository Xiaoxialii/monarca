"use client";

import { SignIn } from "@clerk/nextjs";
import { useSignIn } from "@clerk/nextjs/legacy";
import type { SignInFirstFactor } from "@clerk/nextjs/types";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
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
    emailMethod: "Email",
    emailLabel: "Email",
    emailPlaceholder: "you@example.com",
    codeLabel: "Verification code",
    codePlaceholder: "Enter code",
    codeSignIn: "Sign in with code",
    sendCode: "Send code",
    sendingCode: "Sending...",
    verifyCode: "Verify and sign in",
    verifyingCode: "Verifying...",
    resendCode: "Resend code",
    changeIdentifier: "Use another email",
    sentCode: "Code sent to",
    otherMethods: "Password login",
    codeMethods: "Verification code login",
    continueWithGoogle: "Continue with Google",
    divider: "or",
    googleUnavailable: "Google sign-in is not available right now.",
    missingIdentifier: "Enter your email.",
    missingCode: "Enter the verification code.",
    codeUnavailable: "Verification code login is not enabled for this account. Use another sign-in method.",
    secondFactorRequired: "This account needs an extra verification step. Use password login below.",
    forgotEmail: "Forgot email?",
    note: "Not your computer? Use a private browsing window to sign in",
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
    emailMethod: "邮箱",
    emailLabel: "邮箱",
    emailPlaceholder: "you@example.com",
    codeLabel: "验证码",
    codePlaceholder: "请输入验证码",
    codeSignIn: "验证码登录",
    sendCode: "发送验证码",
    sendingCode: "发送中...",
    verifyCode: "验证并登录",
    verifyingCode: "验证中...",
    resendCode: "重新发送",
    changeIdentifier: "换一个邮箱",
    sentCode: "验证码已发送至",
    otherMethods: "密码登录",
    codeMethods: "验证码登录",
    continueWithGoogle: "使用 Google 登录",
    divider: "或",
    googleUnavailable: "当前无法使用 Google 登录。",
    missingIdentifier: "请输入邮箱。",
    missingCode: "请输入验证码。",
    codeUnavailable: "当前账号未启用验证码登录，请使用下面的其他登录方式。",
    secondFactorRequired: "这个账号还需要额外验证，请使用下面的密码登录。",
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
type CodeFactor = Extract<SignInFirstFactor, { strategy: "email_code" }>;

export function SignInPanel() {
  const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const [locale, setLocale] = useLocale("en");
  const copy = signInCopy[getCopyLocale(locale)];

  return (
    <main lang={getHtmlLang(locale)} className="flex min-h-screen flex-col overflow-x-hidden bg-[#f6f8fb] px-5 py-6 sm:px-8">
      <header className="mx-auto flex w-full max-w-[1240px] justify-end px-1">
        <div className="flex items-center gap-1 rounded-md border border-slate-200 bg-white/80 p-1 text-sm text-slate-500">
          <button
            type="button"
            onClick={() => setLocale("zh")}
            className={`rounded px-2.5 py-1 transition ${
              locale === "zh" ? "bg-slate-100 text-slate-950" : "hover:text-slate-900"
            }`}
          >
            中文
          </button>
          <span className="text-slate-300">/</span>
          <button
            type="button"
            onClick={() => setLocale("en")}
            className={`rounded px-2.5 py-1 transition ${
              locale !== "zh" ? "bg-slate-100 text-slate-950" : "hover:text-slate-900"
            }`}
          >
            EN
          </button>
        </div>
      </header>

      <div className="flex flex-1 items-center justify-center">
        <section className="mx-auto w-full max-w-[1240px] overflow-hidden px-1 py-6 sm:px-4 lg:py-10">
          {clerkKey ? <ClerkSignIn copy={copy} /> : <FallbackSignIn copy={copy} />}
        </section>
      </div>

      <footer className="mx-auto mt-6 flex w-full max-w-[1240px] justify-center px-2 text-xs text-muted-foreground sm:justify-end">
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
  const [mode, setMode] = useState<"code" | "other">("code");

  return (
    <div className="grid min-h-[620px] grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(360px,0.86fr)_minmax(520px,560px)] lg:items-center lg:gap-20">
      <SignInBrand copy={copy} />
      <div className="flex w-full min-w-0 flex-col items-center lg:items-end">
        <div className="w-full max-w-full rounded-lg border border-slate-200 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_20px_50px_rgba(15,23,42,0.07)] sm:max-w-[560px] sm:p-8">
        <GoogleSignInButton copy={copy} />

        <div className="my-5 flex items-center gap-5 text-sm text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          <span>{copy.divider}</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        <div className="mb-5 grid grid-cols-2 gap-1 rounded-md border border-slate-200 bg-slate-50 p-1">
          <button
            type="button"
            onClick={() => setMode("code")}
            className={`h-12 rounded-[5px] text-base font-medium transition ${
              mode === "code" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {copy.codeMethods}
          </button>
          <button
            type="button"
            onClick={() => setMode("other")}
            className={`h-12 rounded-[5px] text-base font-medium transition ${
              mode === "other" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {copy.otherMethods}
          </button>
        </div>

        {mode === "code" ? (
          <CodeSignIn copy={copy} />
        ) : (
          <SignIn
            routing="path"
            path="/sign-in"
            fallbackRedirectUrl="/dashboard"
            forceRedirectUrl="/dashboard"
            appearance={{
              elements: {
                rootBox: "w-full max-w-[520px] min-w-0",
                cardBox: "w-full shadow-none border-0",
                card: "w-full shadow-none p-0",
                header: "hidden",
                socialButtonsBlockButton: "hidden",
                socialButtonsBlockButtonText: "text-base font-medium",
                socialButtonsProviderIcon: "size-5",
                dividerRow: "hidden",
                formFieldInput: "h-14 rounded-md border-slate-300 text-base",
                formButtonPrimary: "h-14 rounded-md bg-primary px-6 text-base hover:bg-primary/90 text-primary-foreground",
                footer: "hidden"
              }
            }}
          />
        )}
        </div>
      </div>
    </div>
  );
}

function GoogleSignInButton({ copy }: { copy: SignInCopy }) {
  const { isLoaded, signIn } = useSignIn();
  const [error, setError] = useState("");
  const [isRedirecting, setIsRedirecting] = useState(false);

  function getErrorMessage(errorValue: unknown) {
    if (typeof errorValue === "object" && errorValue && "errors" in errorValue) {
      const clerkError = errorValue as { errors?: Array<{ longMessage?: string; message?: string }> };
      return clerkError.errors?.[0]?.longMessage || clerkError.errors?.[0]?.message || copy.googleUnavailable;
    }

    return errorValue instanceof Error ? errorValue.message : copy.googleUnavailable;
  }

  async function startGoogleSignIn() {
    if (!isLoaded || isRedirecting) return;

    setError("");
    setIsRedirecting(true);

    try {
      await signIn.authenticateWithRedirect({
        strategy: "oauth_google",
        redirectUrl: "/sign-in/sso-callback",
        redirectUrlComplete: "/dashboard"
      });
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
      setIsRedirecting(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        onClick={() => void startGoogleSignIn()}
        disabled={!isLoaded || isRedirecting}
        aria-busy={isRedirecting}
        className="h-14 w-full cursor-pointer select-none rounded-md border-slate-300 bg-white text-base font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 active:scale-[0.99] disabled:cursor-wait"
      >
        <span className="text-xl font-semibold text-[#4285f4]">G</span>
        {copy.continueWithGoogle}
      </Button>
      {error ? <p className="text-sm leading-6 text-red-600">{error}</p> : null}
    </div>
  );
}

function CodeSignIn({ copy }: { copy: SignInCopy }) {
  const router = useRouter();
  const { isLoaded, signIn, setActive } = useSignIn();
  const [emailAddress, setEmailAddress] = useState("");
  const [code, setCode] = useState("");
  const [factor, setFactor] = useState<CodeFactor | null>(null);
  const [sentTo, setSentTo] = useState("");
  const [step, setStep] = useState<"identifier" | "code">("identifier");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setError("");
  }, [copy]);

  function getErrorMessage(errorValue: unknown) {
    if (typeof errorValue === "object" && errorValue && "errors" in errorValue) {
      const clerkError = errorValue as { errors?: Array<{ longMessage?: string; message?: string }> };
      return clerkError.errors?.[0]?.longMessage || clerkError.errors?.[0]?.message || copy.codeUnavailable;
    }

    return errorValue instanceof Error ? errorValue.message : copy.codeUnavailable;
  }

  function findCodeFactor(factors: SignInFirstFactor[]): CodeFactor | null {
    const emailFactor = factors.find((item): item is Extract<SignInFirstFactor, { strategy: "email_code" }> => item.strategy === "email_code");

    return emailFactor || null;
  }

  async function sendCode(nextFactor?: CodeFactor) {
    if (!isLoaded) return;

    const trimmedIdentifier = emailAddress.trim();
    const selectedFactor = nextFactor || factor;

    if (!trimmedIdentifier && !selectedFactor) {
      setError(copy.missingIdentifier);
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      let currentFactor = selectedFactor;

      if (!currentFactor) {
        const result = await signIn.create({ identifier: trimmedIdentifier });

        if (result.status === "complete" && result.createdSessionId) {
          await setActive({ session: result.createdSessionId });
          router.push("/dashboard");
          return;
        }

        currentFactor = findCodeFactor(result.supportedFirstFactors || []);
      }

      if (!currentFactor) {
        setError(copy.codeUnavailable);
        return;
      }

      await signIn.prepareFirstFactor({
        strategy: "email_code",
        emailAddressId: currentFactor.emailAddressId
      });

      setFactor(currentFactor);
      setSentTo(currentFactor.safeIdentifier);
      setStep("code");
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isLoaded || !factor) return;

    const trimmedCode = code.trim();

    if (!trimmedCode) {
      setError(copy.missingCode);
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const result = await signIn.attemptFirstFactor({
        strategy: factor.strategy,
        code: trimmedCode
      });

      if (result.status === "complete" && result.createdSessionId) {
        await setActive({ session: result.createdSessionId });
        router.push("/dashboard");
        return;
      }

      setError(result.status === "needs_second_factor" ? copy.secondFactorRequired : copy.codeUnavailable);
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
    } finally {
      setIsSubmitting(false);
    }
  }

  function resetIdentifier() {
    setCode("");
    setError("");
    setFactor(null);
    setSentTo("");
    setStep("identifier");
  }

  return (
    <div className="w-full min-w-0">
      {step === "identifier" ? (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void sendCode();
          }}
        >
          <div className="space-y-2">
            <label className="sr-only" htmlFor="otp-email">
              {copy.emailLabel}
            </label>
            <Input
              id="otp-email"
              autoComplete="email"
              inputMode="email"
              type="email"
              value={emailAddress}
              onChange={(event) => setEmailAddress(event.target.value)}
              placeholder={copy.emailPlaceholder}
              className="h-14 rounded-md border-slate-300 bg-white text-base shadow-sm focus-visible:ring-slate-200"
            />
          </div>

          {error ? <p className="text-sm leading-6 text-red-600">{error}</p> : null}

          <Button type="submit" disabled={isSubmitting || !isLoaded} className="h-14 w-full rounded-md px-6 text-base">
            {isSubmitting ? copy.sendingCode : copy.sendCode}
            <ArrowRight />
          </Button>
        </form>
      ) : (
        <form className="space-y-5" onSubmit={verifyCode}>
          <div className="space-y-2">
            <p className="text-sm leading-6 text-muted-foreground">
              {copy.sentCode} <span className="font-medium text-foreground">{sentTo}</span>
            </p>
            <label className="sr-only" htmlFor="otp-code">
              {copy.codeLabel}
            </label>
            <Input
              id="otp-code"
              autoComplete="one-time-code"
              inputMode="numeric"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder={copy.codePlaceholder}
              className="h-14 rounded-md border-slate-300 bg-white text-base shadow-sm focus-visible:ring-slate-200"
            />
          </div>

          {error ? <p className="text-sm leading-6 text-red-600">{error}</p> : null}

          <div className="flex flex-col gap-3">
            <Button type="submit" disabled={isSubmitting || !isLoaded} className="h-14 w-full rounded-md px-6 text-base">
              {isSubmitting ? copy.verifyingCode : copy.verifyCode}
              <ArrowRight />
            </Button>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
              <Button type="button" variant="ghost" onClick={() => void sendCode(factor || undefined)} className="rounded-full px-4 text-teal-700 hover:bg-teal-50 hover:text-teal-800">
                {copy.resendCode}
              </Button>
              <Button type="button" variant="ghost" onClick={resetIdentifier} className="rounded-full px-4 text-slate-600 hover:bg-slate-50 hover:text-slate-900">
                {copy.changeIdentifier}
              </Button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}

function FallbackSignIn({ copy }: { copy: SignInCopy }) {
  return (
    <div className="grid min-h-[420px] gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
      <SignInBrand copy={copy} />

      <div className="flex min-w-0 flex-col justify-between">
        <div className="space-y-8">
          <div className="space-y-2">
            <label className="sr-only" htmlFor="email">
              {copy.emailLabel}
            </label>
            <Input
              id="email"
              type="email"
              placeholder={copy.emailPlaceholder}
              defaultValue="hello@monarca.ai"
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
    <div className="w-full min-w-0">
      <Link href="/" className="mb-10 flex w-fit items-center" aria-label={copy.brand}>
        <BrandLogo label={copy.brand} className="h-14" />
      </Link>
      <h1 className="max-w-full break-words text-4xl font-semibold leading-tight tracking-normal text-slate-950 sm:max-w-[460px] sm:text-5xl lg:text-6xl">
        {copy.title}
      </h1>
      <p className="mt-5 max-w-full text-lg leading-8 text-slate-700 sm:max-w-[430px]">
        {copy.description}
      </p>
    </div>
  );
}
