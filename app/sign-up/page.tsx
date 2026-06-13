import { Suspense } from "react";
import { SignUpPanel } from "@/components/sign-up-panel";
import { getRequestLocale } from "@/lib/server-locale";

export default async function SignUpPage() {
  const defaultLocale = await getRequestLocale("en");

  return (
    <Suspense>
      <SignUpPanel defaultLocale={defaultLocale} />
    </Suspense>
  );
}
