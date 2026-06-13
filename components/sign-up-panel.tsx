"use client";

import { useSignUp } from "@clerk/nextjs/legacy";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
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
    emailCodeMode: "Email",
    passwordMode: "Username",
    emailLabel: "Email",
    usernameLabel: "Username",
    passwordLabel: "Password",
    confirmPasswordLabel: "Confirm password",
    showPassword: "Show password",
    hidePassword: "Hide password",
    emailPlaceholder: "you@example.com",
    usernamePlaceholder: "Choose a username",
    passwordPlaceholder: "At least 8 characters",
    confirmPasswordPlaceholder: "Enter password again",
    codeLabel: "Verification code",
    codePlaceholder: "Enter code",
    emailCodeIntro: "We will send a one-time verification code to your email. No password is required.",
    passwordIntro: "Create an account with only a username and password. No email is required.",
    continueWithGoogle: "Continue with Google",
    divider: "or",
    sendEmailCode: "Send email code",
    sendingEmailCode: "Sending...",
    createWithPassword: "Create with username",
    creatingWithPassword: "Creating...",
    createWithCode: "Create account",
    creatingWithCode: "Creating...",
    resendCode: "Resend code",
    changeIdentifier: "Edit account details",
    sentCode: "Code sent to",
    missingEmail: "Enter your email.",
    missingUsername: "Enter your username.",
    invalidUsernameLength: "Username must be between 4 and 64 characters long.",
    missingPassword: "Enter your password.",
    shortPassword: "Password must be at least 8 characters.",
    passwordMismatch: "Passwords do not match.",
    missingCode: "Enter the verification code.",
    codeUnavailable: "Email verification code sign-up is not enabled. Check the Clerk sign-up settings.",
    passwordUnavailable: "Username and password sign-up is not enabled. Enable username sign-up in Clerk, then try again.",
    incompleteSignUp: "The code was verified, but Clerk still requires: {fields}. Make these fields optional in Clerk, or add them to this sign-up form.",
    passwordIncompleteSignUp: "Clerk still requires: {fields}. Make email optional in Clerk to support username-only sign-up, or switch this form back to email + password.",
    pendingVerification: "The code was accepted, but Clerk still needs verification for: {fields}.",
    passwordPendingVerification: "Clerk still needs verification for: {fields}. Check the username/password sign-up settings in Clerk.",
    incompleteStatus: "The code was accepted, but sign-up is not complete yet. Clerk status: {status}.",
    passwordIncompleteStatus: "Sign-up is not complete yet. Clerk status: {status}.",
    googleUnavailable: "Google sign-up is not available right now.",
    signInPrompt: "Already have an account?",
    signInInstead: "Sign in",
    next: "Next",
    brand: "Monarca AI",
    title: "Start automatically analyzing your business data",
    description:
      "Connect databases, Excel, and business systems to automatically generate operating briefs, growth insights, and action recommendations."
  },
  zh: {
    language: "中文（简体）",
    help: "帮助",
    privacy: "隐私",
    terms: "条款",
    emailCodeMode: "邮箱",
    passwordMode: "用户名密码",
    emailLabel: "邮箱",
    usernameLabel: "用户名",
    passwordLabel: "密码",
    confirmPasswordLabel: "确认密码",
    showPassword: "显示密码",
    hidePassword: "隐藏密码",
    emailPlaceholder: "you@example.com",
    usernamePlaceholder: "请输入用户名",
    passwordPlaceholder: "至少 8 位",
    confirmPasswordPlaceholder: "请再次输入密码",
    codeLabel: "验证码",
    codePlaceholder: "请输入验证码",
    emailCodeIntro: "我们会向你的邮箱发送一次性验证码，不需要设置密码。",
    passwordIntro: "只使用用户名和密码创建账号，不需要输入邮箱。",
    continueWithGoogle: "Continue with Google",
    divider: "或",
    sendEmailCode: "发送邮箱验证码",
    sendingEmailCode: "发送中...",
    createWithPassword: "使用用户名创建账号",
    creatingWithPassword: "创建中...",
    createWithCode: "创建账号",
    creatingWithCode: "创建中...",
    resendCode: "重新发送",
    changeIdentifier: "修改注册信息",
    sentCode: "验证码已发送至",
    missingEmail: "请输入邮箱。",
    missingUsername: "请输入用户名。",
    invalidUsernameLength: "用户名长度需要在 4 到 64 个字符之间。",
    missingPassword: "请输入密码。",
    shortPassword: "密码至少需要 8 位。",
    passwordMismatch: "两次输入的密码不一致。",
    missingCode: "请输入验证码。",
    codeUnavailable: "当前未启用邮箱验证码注册，请检查 Clerk 注册设置。",
    passwordUnavailable: "当前 Clerk 后台没有开启用户名注册，请先在 Clerk 注册设置中启用 username。",
    incompleteSignUp: "验证码已通过，但 Clerk 注册还缺必填项：{fields}。请在 Clerk Dashboard 把这些字段改为 optional，或把注册页补上对应字段。",
    passwordIncompleteSignUp: "Clerk 注册还缺必填项：{fields}。如果要支持只用用户名和密码注册，请在 Clerk 后台把邮箱改为 optional；否则需要把注册页改回邮箱 + 密码。",
    pendingVerification: "验证码已通过，但 Clerk 还要求继续验证：{fields}。",
    passwordPendingVerification: "Clerk 还要求继续验证：{fields}。请检查 Clerk 后台的用户名密码注册设置。",
    incompleteStatus: "验证码已通过，但注册还没有完成。Clerk 当前状态：{status}。",
    passwordIncompleteStatus: "注册还没有完成。Clerk 当前状态：{status}。",
    googleUnavailable: "当前无法使用 Google 注册。",
    signInPrompt: "已有账号？",
    signInInstead: "登录",
    next: "下一步",
    brand: "蝴蝶效应",
    title: "开始自动分析你的业务数据",
    description: "连接数据库、Excel 和业务系统，自动生成经营简报、增长洞察和行动建议。"
  }
} as const;

type SignUpCopy = (typeof signUpCopy)[CopyLocale];

function authRedirectPath(searchParams: { get: (key: string) => string | null } | null, fallback = "/dashboard") {
  const value = searchParams?.get("redirect_url");

  if (value?.startsWith("/") && !value.startsWith("//")) {
    return value;
  }

  return fallback;
}

export function SignUpPanel() {
  const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const [locale, setLocale] = useLocale("en");
  const copy = signUpCopy[getCopyLocale(locale)];

  return (
    <main lang={getHtmlLang(locale)} className="flex min-h-screen flex-col overflow-x-hidden bg-[#f7f8fa] px-5 py-5 sm:px-8">
      <header className="mx-auto flex w-full max-w-[1080px] justify-end px-1">
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
        <section className="mx-auto w-full max-w-[1080px] overflow-hidden px-1 py-6 sm:px-4 lg:py-8">
          {clerkKey ? <ClerkSignUp copy={copy} /> : <FallbackSignUp copy={copy} />}
        </section>
      </div>

      <footer className="mx-auto mt-4 flex w-full max-w-[1080px] justify-center px-2 text-xs text-muted-foreground sm:justify-end">
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
    <div className="grid min-h-[560px] grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(300px,380px)_minmax(420px,480px)] lg:items-center lg:justify-center lg:gap-14">
      <AccountBrand copy={copy} />
      <div className="flex w-full min-w-0 items-center justify-center lg:justify-end">
        <PasswordSignUp copy={copy} />
      </div>
    </div>
  );
}

function PasswordSignUp({ copy }: { copy: SignUpCopy }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoaded, signUp, setActive } = useSignUp();
  const [mode, setMode] = useState<"email" | "password">("email");
  const [emailAddress, setEmailAddress] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [step, setStep] = useState<"identifier" | "code">("identifier");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleRedirecting, setIsGoogleRedirecting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setError("");
  }, [copy]);

  function getErrorMessage(errorValue: unknown) {
    if (typeof errorValue === "object" && errorValue && "errors" in errorValue) {
      const clerkError = errorValue as { errors?: Array<{ code?: string; longMessage?: string; message?: string }> };
      const firstError = clerkError.errors?.[0];
      const clerkMessage = firstError?.longMessage || firstError?.message || "";
      const errorCode = firstError?.code || "";

      if (
        mode === "password" &&
        (errorCode.includes("form_param") ||
          clerkMessage.toLowerCase().includes("username is not a valid parameter"))
      ) {
        return copy.passwordUnavailable;
      }

      if (
        mode === "password" &&
        clerkMessage.toLowerCase().includes("username must be between 4 and 64 characters")
      ) {
        return copy.invalidUsernameLength;
      }

      return clerkMessage || (mode === "password" ? copy.passwordUnavailable : copy.codeUnavailable);
    }

    return errorValue instanceof Error
      ? errorValue.message
      : mode === "password"
        ? copy.passwordUnavailable
        : copy.codeUnavailable;
  }

  function getSignUpStateMessage(result: unknown) {
    if (!result || typeof result !== "object") {
      return copy.codeUnavailable;
    }

    const signUpState = result as {
      status?: string | null;
      missingFields?: string[] | null;
      requiredFields?: string[] | null;
      unverifiedFields?: string[] | null;
    };
    const missingFields = Array.from(new Set([
      ...(signUpState.missingFields || []),
      ...(signUpState.requiredFields || [])
    ]));
    const unverifiedFields = signUpState.unverifiedFields || [];

    if (missingFields.length) {
      return (mode === "password" ? copy.passwordIncompleteSignUp : copy.incompleteSignUp).replace(
        "{fields}",
        missingFields.join(", ")
      );
    }

    if (unverifiedFields.length) {
      return (mode === "password" ? copy.passwordPendingVerification : copy.pendingVerification).replace(
        "{fields}",
        unverifiedFields.join(", ")
      );
    }

    if (signUpState.status) {
      return (mode === "password" ? copy.passwordIncompleteStatus : copy.incompleteStatus).replace(
        "{status}",
        signUpState.status
      );
    }

    return copy.codeUnavailable;
  }

  function selectMode(nextMode: "email" | "password") {
    setMode(nextMode);
    setError("");
    setCode("");
    setSentTo("");
    setStep("identifier");
  }

  async function activateCompletedSignUp(createdSessionId: string | null) {
    if (createdSessionId && setActive) {
      await setActive({ session: createdSessionId });
      router.push(authRedirectPath(searchParams));
    }
  }

  async function startGoogleSignUp() {
    if (!isLoaded || isGoogleRedirecting) return;

    setError("");
    setIsGoogleRedirecting(true);

    try {
      await signUp.authenticateWithRedirect({
        strategy: "oauth_google",
        redirectUrl: "/sign-up/sso-callback",
        redirectUrlComplete: authRedirectPath(searchParams)
      });
    } catch (caughtError) {
      setError(getErrorMessage(caughtError) || copy.googleUnavailable);
      setIsGoogleRedirecting(false);
    }
  }

  async function createAccount() {
    if (!isLoaded) return;

    const trimmedEmail = emailAddress.trim();

    if (!trimmedEmail) {
      setError(copy.missingEmail);
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const nextSignUp = await signUp.create({
        emailAddress: trimmedEmail
      });

      if (nextSignUp.status === "complete") {
        await activateCompletedSignUp(nextSignUp.createdSessionId);
        return;
      }

      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });

      setSentTo(trimmedEmail);
      setStep("code");
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function createPasswordAccount() {
    if (!isLoaded) return;

    const trimmedUsername = username.trim();

    if (!trimmedUsername) {
      setError(copy.missingUsername);
      return;
    }

    if (trimmedUsername.length < 4 || trimmedUsername.length > 64) {
      setError(copy.invalidUsernameLength);
      return;
    }

    if (!password) {
      setError(copy.missingPassword);
      return;
    }

    if (password.length < 8) {
      setError(copy.shortPassword);
      return;
    }

    if (password !== confirmPassword) {
      setError(copy.passwordMismatch);
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const nextSignUp = await signUp.create({
        username: trimmedUsername,
        password
      });

      if (nextSignUp.status === "complete") {
        await activateCompletedSignUp(nextSignUp.createdSessionId);
        return;
      }

      setError(getSignUpStateMessage(nextSignUp));
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isLoaded) return;

    const trimmedCode = code.trim();

    if (!trimmedCode) {
      setError(copy.missingCode);
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const result = await signUp.attemptEmailAddressVerification({ code: trimmedCode });

      if (result.status === "complete" && result.createdSessionId) {
        await setActive({ session: result.createdSessionId });
        router.push(authRedirectPath(searchParams));
        return;
      }

      setError(getSignUpStateMessage(result));
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
    } finally {
      setIsSubmitting(false);
    }
  }

  function resetIdentifier() {
    setCode("");
    setError("");
    setSentTo("");
    setStep("identifier");
  }

  return (
    <div className="w-full max-w-full min-w-0 rounded-lg border border-slate-100 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.03),0_12px_28px_rgba(15,23,42,0.04)] sm:max-w-[480px] sm:p-7">
      {step === "identifier" ? (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (mode === "email") {
              void createAccount();
              return;
            }

            void createPasswordAccount();
          }}
        >
          <Button
            type="button"
            variant="outline"
            onClick={() => void startGoogleSignUp()}
            disabled={!isLoaded || isGoogleRedirecting}
            aria-busy={isGoogleRedirecting}
            className="h-12 w-full cursor-pointer select-none rounded-md border-slate-200 bg-white text-sm font-medium text-slate-700 shadow-none transition hover:bg-slate-50 active:scale-[0.99] disabled:cursor-wait"
          >
            <span className="text-xl font-semibold text-[#4285f4]">G</span>
            {copy.continueWithGoogle}
          </Button>

          <div className="flex items-center gap-5 py-1 text-sm text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            <span>{copy.divider}</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <div className="grid grid-cols-2 rounded-md bg-slate-100 p-1 text-sm font-medium text-slate-500">
            <button
              type="button"
              onClick={() => selectMode("email")}
              className={`flex h-10 items-center justify-center rounded transition ${
                mode === "email" ? "bg-white text-slate-950 shadow-sm" : "hover:text-slate-900"
              }`}
            >
              {copy.emailCodeMode}
            </button>
            <button
              type="button"
              onClick={() => selectMode("password")}
              className={`flex h-10 items-center justify-center rounded transition ${
                mode === "password" ? "bg-white text-slate-950 shadow-sm" : "hover:text-slate-900"
              }`}
            >
              {copy.passwordMode}
            </button>
          </div>

          {mode === "email" ? (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="signup-email">
                  {copy.emailLabel}
                </label>
                <Input
                  id="signup-email"
                  autoComplete="email"
                  inputMode="email"
                  type="email"
                  value={emailAddress}
                  onChange={(event) => setEmailAddress(event.target.value)}
                  placeholder={copy.emailPlaceholder}
                  className="h-12 rounded-md border-slate-200 bg-white text-sm shadow-none focus-visible:ring-slate-200"
                />
              </div>

              <p className="px-1 text-sm leading-6 text-slate-500">
                {copy.emailCodeIntro}
              </p>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="signup-username">
                  {copy.usernameLabel}
                </label>
                <Input
                  id="signup-username"
                  autoComplete="username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder={copy.usernamePlaceholder}
                  className="h-12 rounded-md border-slate-200 bg-white text-sm shadow-none focus-visible:ring-slate-200"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="signup-password">
                  {copy.passwordLabel}
                </label>
                <div className="relative">
                  <Input
                    id="signup-password"
                    autoComplete="new-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder={copy.passwordPlaceholder}
                    className="h-12 rounded-md border-slate-200 bg-white pr-12 text-sm shadow-none focus-visible:ring-slate-200"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    className="absolute right-3 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded text-slate-400 transition hover:bg-slate-50 hover:text-slate-700"
                    aria-label={showPassword ? copy.hidePassword : copy.showPassword}
                    title={showPassword ? copy.hidePassword : copy.showPassword}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="signup-confirm-password">
                  {copy.confirmPasswordLabel}
                </label>
                <div className="relative">
                  <Input
                    id="signup-confirm-password"
                    autoComplete="new-password"
                    type={showPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder={copy.confirmPasswordPlaceholder}
                    className="h-12 rounded-md border-slate-200 bg-white pr-12 text-sm shadow-none focus-visible:ring-slate-200"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    className="absolute right-3 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded text-slate-400 transition hover:bg-slate-50 hover:text-slate-700"
                    aria-label={showPassword ? copy.hidePassword : copy.showPassword}
                    title={showPassword ? copy.hidePassword : copy.showPassword}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>

              <p className="px-1 text-sm leading-6 text-slate-500">
                {copy.passwordIntro}
              </p>
            </>
          )}

          {error ? <p className="text-sm leading-6 text-red-600">{error}</p> : null}

          <Button type="submit" disabled={isSubmitting} className="h-12 w-full rounded-md px-6 text-sm font-medium">
            {isSubmitting
              ? mode === "password"
                ? copy.creatingWithPassword
                : copy.sendingEmailCode
              : mode === "password"
                ? copy.createWithPassword
                : copy.sendEmailCode}
            <ArrowRight />
          </Button>
          <div className="text-center text-sm text-slate-400">
            {copy.signInPrompt}
            <Link href="/sign-in" className="ml-1 font-medium text-slate-700 hover:text-slate-950 hover:underline">
              {copy.signInInstead}
            </Link>
          </div>
        </form>
      ) : (
        <form className="space-y-5" onSubmit={verifyCode}>
          <div className="space-y-2">
            <p className="text-sm leading-6 text-muted-foreground">
              {copy.sentCode} <span className="font-medium text-foreground">{sentTo}</span>
            </p>
            <label className="text-sm font-medium" htmlFor="signup-code">
              {copy.codeLabel}
            </label>
            <Input
              id="signup-code"
              autoComplete="one-time-code"
              inputMode="numeric"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder={copy.codePlaceholder}
              className="h-12 rounded-md border-slate-200 bg-white text-sm shadow-none focus-visible:ring-slate-200"
            />
          </div>

          {error ? <p className="text-sm leading-6 text-red-600">{error}</p> : null}

          <div className="flex flex-col gap-3">
            <Button type="submit" disabled={isSubmitting} className="h-12 w-full rounded-md px-6 text-sm font-medium">
              {isSubmitting ? copy.creatingWithCode : copy.createWithCode}
              <ArrowRight />
            </Button>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
              <Button type="button" variant="ghost" onClick={() => void createAccount()} className="rounded-full px-4 text-teal-700 hover:bg-teal-50 hover:text-teal-800">
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

function FallbackSignUp({ copy }: { copy: SignUpCopy }) {
  return (
    <div className="grid min-h-[460px] gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
      <AccountBrand copy={copy} />

      <div className="flex min-w-0 flex-col justify-between">
        <div className="space-y-5">
          <div className="space-y-1.5">
            <label className="sr-only" htmlFor="fallback-email">
              {copy.emailLabel}
            </label>
            <Input
              id="fallback-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder={copy.emailPlaceholder}
              className="h-[52px] rounded-md border-slate-300 bg-white text-base shadow-none focus-visible:ring-1"
            />
            <p className="px-1 text-xs leading-5 text-slate-500">
              {copy.emailCodeIntro}
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
    <div className="mx-auto flex h-full w-full max-w-[400px] min-w-0 flex-col items-center justify-center text-center">
      <Link href="/" className="mb-7 flex w-fit items-center" aria-label={copy.brand}>
        <BrandLogo label={copy.brand} className="h-10" />
      </Link>
      <h1 className="max-w-full break-words text-3xl font-semibold leading-tight tracking-normal text-slate-950 sm:text-4xl lg:text-[42px]">
        {copy.title}
      </h1>
      <p className="mt-4 max-w-[360px] text-base leading-7 text-slate-600">
        {copy.description}
      </p>
    </div>
  );
}
