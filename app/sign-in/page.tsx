import { SignInPanel } from "@/components/sign-in-panel";
import { getRequestLocale } from "@/lib/server-locale";

export default async function SignInPage() {
  const locale = await getRequestLocale("en");

  return <SignInPanel defaultLocale={locale} />;
}
