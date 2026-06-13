import { Suspense } from "react";
import { SignInPanel } from "@/components/sign-in-panel";
import { getRequestLocale } from "@/lib/server-locale";

export default async function SignInPage() {
  const defaultLocale = await getRequestLocale("en");

  return (
    <Suspense>
      <SignInPanel defaultLocale={defaultLocale} />
    </Suspense>
  );
}
