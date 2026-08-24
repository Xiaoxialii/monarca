import { SignUpPanel } from "@/components/sign-up-panel";
import { getRequestLocale } from "@/lib/server-locale";

export default async function SignUpPage() {
  const locale = await getRequestLocale("en");

  return <SignUpPanel defaultLocale={locale} />;
}
