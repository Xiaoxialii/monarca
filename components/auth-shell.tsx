"use client";

import { ClerkProvider, SignedIn, SignedOut, SignInButton, SignOutButton } from "@clerk/nextjs";
import { LogIn, LogOut } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

function DemoUser() {
  return (
    <Button asChild variant="outline" size="sm">
      <Link href="/sign-in">
        <LogOut />
        Sign out
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

  if (!clerkKey) {
    return <DemoUser />;
  }

  return (
    <>
      <SignedOut>
        <SignInButton mode="modal">
          <Button variant="outline" size="sm">
            <LogIn />
            Sign in
          </Button>
        </SignInButton>
      </SignedOut>
      <SignedIn>
        <SignOutButton>
          <Button variant="outline" size="sm">
            <LogOut />
            Sign out
          </Button>
        </SignOutButton>
      </SignedIn>
    </>
  );
}
