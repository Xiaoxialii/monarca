"use client";

import { Show, SignInButton, SignUpButton, UserButton, useUser } from "@clerk/nextjs";
import { useEffect } from "react";
import { LogIn, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCopyLocale, useLocale } from "@/lib/locale";

const authCopy = {
  en: {
    signIn: "Sign in",
    signUp: "Sign up"
  },
  zh: {
    signIn: "登录",
    signUp: "注册"
  }
} as const;

function SyncSignedInUser() {
  const { isLoaded, isSignedIn, user } = useUser();

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user?.id) {
      return;
    }

    void fetch("/api/user/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      }
    }).catch(() => {
      // Keep sign-in usable even if the local database is temporarily unavailable.
    });
  }, [isLoaded, isSignedIn, user?.id]);

  return null;
}

export function AuthControls() {
  const [locale] = useLocale("en");
  const copy = authCopy[getCopyLocale(locale)];

  return (
    <>
      <Show when="signed-out">
        <div className="flex items-center gap-2">
          <SignInButton mode="modal" fallbackRedirectUrl="/dashboard" forceRedirectUrl="/dashboard">
            <Button variant="outline" size="sm">
              <LogIn />
              {copy.signIn}
            </Button>
          </SignInButton>
          <SignUpButton mode="modal" fallbackRedirectUrl="/dashboard" forceRedirectUrl="/dashboard">
            <Button size="sm">
              <UserPlus />
              {copy.signUp}
            </Button>
          </SignUpButton>
        </div>
      </Show>
      <Show when="signed-in">
        <SyncSignedInUser />
        <UserButton />
      </Show>
    </>
  );
}
