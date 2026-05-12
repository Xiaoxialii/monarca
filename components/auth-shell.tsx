"use client";

import { ClerkProvider, SignedIn, SignedOut, SignInButton, SignOutButton } from "@clerk/nextjs";
import { LogIn, LogOut } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useLocale, type Locale } from "@/lib/locale";

const authCopy = {
  en: {
    signIn: "Sign in",
    signOut: "Sign out"
  },
  zh: {
    signIn: "登录",
    signOut: "退出登录"
  }
} as const;

function DemoUser({ locale }: { locale: Locale }) {
  const copy = authCopy[locale];

  return (
    <Button asChild variant="outline" size="sm">
      <Link href="/sign-in">
        <LogOut />
        {copy.signOut}
      </Link>
    </Button>
  );
}

export function AuthShell({ children }: { children: React.ReactNode }) {
  const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  if (!clerkKey) {
    return <>{children}</>;
  }

  return <ClerkProvider publishableKey={clerkKey}>{children}</ClerkProvider>;
}

export function AuthControls() {
  const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const [locale] = useLocale("en");
  const copy = authCopy[locale];

  if (!clerkKey) {
    return <DemoUser locale={locale} />;
  }

  return (
    <>
      <SignedOut>
        <SignInButton mode="modal">
          <Button variant="outline" size="sm">
            <LogIn />
            {copy.signIn}
          </Button>
        </SignInButton>
      </SignedOut>
      <SignedIn>
        <SignOutButton>
          <Button variant="outline" size="sm">
            <LogOut />
            {copy.signOut}
          </Button>
        </SignOutButton>
      </SignedIn>
    </>
  );
}
