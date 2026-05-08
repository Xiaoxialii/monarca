"use client";

import { SignIn } from "@clerk/nextjs";
import { ArrowRight, ChevronDown, Sparkles } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SignInPanel() {
  const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  return (
    <main className="flex min-h-screen flex-col bg-[#f8fafd] px-4 py-6 sm:px-6">
      <div className="flex flex-1 items-center justify-center">
        <section className="w-full max-w-[1040px] rounded-[28px] bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_20px_70px_rgba(16,24,40,0.08)] sm:p-10">
          {clerkKey ? <ClerkSignIn /> : <DemoSignIn />}
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

function ClerkSignIn() {
  return (
    <div className="grid min-h-[420px] gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
      <SignInBrand />
      <SignIn
        routing="path"
        path="/sign-in"
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

function DemoSignIn() {
  return (
    <div className="grid min-h-[420px] gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
      <SignInBrand />

      <div className="flex flex-col justify-between">
        <div className="space-y-8">
          <div className="space-y-2">
            <label className="sr-only" htmlFor="email">
              Email or phone
            </label>
            <Input
              id="email"
              type="email"
              placeholder="Email or phone"
              defaultValue="demo@butterfly.ai"
              className="h-14 rounded-md text-base"
            />
          </div>

          <div className="space-y-3">
            <Button variant="ghost" className="h-auto px-0 text-sm font-medium text-teal-700 hover:bg-transparent hover:text-teal-800">
              Forgot email?
            </Button>
            <p className="max-w-lg text-sm leading-6 text-muted-foreground">
              Not your computer? Use a private browsing window to sign in. This demo continues directly to the dashboard.
            </p>
          </div>
        </div>

        <div className="mt-10 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
          <Button asChild variant="ghost" className="rounded-full px-5 text-teal-700 hover:bg-teal-50 hover:text-teal-800">
            <Link href="/sign-up">Create account</Link>
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

function SignInBrand() {
  return (
    <div>
      <Link href="/" className="mb-8 flex w-fit items-center gap-2">
        <div className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
          <Sparkles className="size-5" />
        </div>
        <span className="text-sm font-semibold">openAnalyst</span>
      </Link>
      <h1 className="text-4xl font-normal tracking-normal text-foreground sm:text-5xl">
        Sign in
      </h1>
      <p className="mt-5 text-base leading-7 text-foreground">
        Use your openAnalyst account to continue to the AI analytics dashboard.
      </p>
    </div>
  );
}
