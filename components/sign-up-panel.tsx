"use client";

import { SignUp } from "@clerk/nextjs";
import { ArrowRight, ChevronDown, Eye, Sparkles } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SignUpPanel() {
  const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  return (
    <main className="flex min-h-screen flex-col bg-[#f8fafd] px-4 py-6 sm:px-6">
      <div className="flex flex-1 items-center justify-center">
        <section className="w-full max-w-[1040px] rounded-[28px] bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_20px_70px_rgba(16,24,40,0.08)] sm:p-10 lg:p-12">
          {clerkKey ? <ClerkSignUp /> : <DemoSignUp />}
        </section>
      </div>

      <footer className="mx-auto mt-6 flex w-full max-w-[1040px] flex-col gap-4 px-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <button className="flex w-fit items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-white">
          English (United States)
          <ChevronDown className="size-3" />
        </button>
        <div className="flex gap-5">
          <Link href="/" className="hover:text-foreground">
            Help
          </Link>
          <Link href="/" className="hover:text-foreground">
            Privacy
          </Link>
          <Link href="/" className="hover:text-foreground">
            Terms
          </Link>
        </div>
      </footer>
    </main>
  );
}

function ClerkSignUp() {
  return (
    <div className="grid min-h-[460px] gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:gap-20">
      <AccountBrand />
      <SignUp
        routing="path"
        path="/sign-up"
        fallbackRedirectUrl="/"
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

function DemoSignUp() {
  return (
    <div className="grid min-h-[460px] gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
      <AccountBrand />

      <div className="flex flex-col justify-between">
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="sr-only" htmlFor="first-name">
                First name
              </label>
              <Input
                id="first-name"
                placeholder="First name"
                className="h-[52px] rounded-md border-slate-300 bg-white text-base shadow-none focus-visible:ring-1"
              />
            </div>
            <div className="space-y-2">
              <label className="sr-only" htmlFor="last-name">
                Last name
              </label>
              <Input
                id="last-name"
                placeholder="Last name"
                className="h-[52px] rounded-md border-slate-300 bg-white text-base shadow-none focus-visible:ring-1"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="sr-only" htmlFor="username">
              Username
            </label>
            <Input
              id="username"
              placeholder="Username"
              className="h-[52px] rounded-md border-slate-300 bg-white text-base shadow-none focus-visible:ring-1"
            />
            <p className="px-1 text-xs leading-5 text-slate-500">
              You can use letters, numbers, and periods.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="sr-only" htmlFor="password">
                Password
              </label>
              <Input
                id="password"
                type="password"
                placeholder="Password"
                className="h-[52px] rounded-md border-slate-300 bg-white text-base shadow-none focus-visible:ring-1"
              />
            </div>
            <div className="space-y-2">
              <label className="sr-only" htmlFor="confirm-password">
                Confirm
              </label>
              <Input
                id="confirm-password"
                type="password"
                placeholder="Confirm"
                className="h-[52px] rounded-md border-slate-300 bg-white text-base shadow-none focus-visible:ring-1"
              />
            </div>
          </div>

          <div className="flex items-start gap-3 px-1">
            <button className="mt-0.5 grid size-5 shrink-0 place-items-center rounded border border-slate-300 text-slate-500 hover:bg-slate-50" aria-label="Show password">
              <Eye className="size-3.5" />
            </button>
            <p className="max-w-lg text-sm leading-6 text-slate-500">
              Use 8 or more characters with a mix of letters, numbers, and symbols.
            </p>
          </div>
        </div>

        <div className="mt-10 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Button asChild variant="ghost" className="rounded-full px-5 text-teal-700 hover:bg-teal-50 hover:text-teal-800">
            <Link href="/sign-in">Sign in instead</Link>
          </Button>
          <Button asChild className="rounded-full px-6">
            <Link href="/">
              Next
              <ArrowRight />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function AccountBrand() {
  return (
    <div>
      <Link href="/" className="mb-8 flex w-fit items-center gap-2">
        <div className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
          <Sparkles className="size-5" />
        </div>
        <span className="text-sm font-semibold">蝴蝶效应</span>
      </Link>
      <h1 className="max-w-sm text-4xl font-normal tracking-normal text-foreground sm:text-5xl">
        Create your account
      </h1>
      <p className="mt-5 max-w-sm text-base leading-7 text-foreground">
        Start using 蝴蝶效应 to connect data, forecast growth, and ask questions across your business.
      </p>
    </div>
  );
}
