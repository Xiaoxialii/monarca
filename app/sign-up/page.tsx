import { AccessApprovalCard } from "@/components/access-approval-card";
import { getRequestLocale } from "@/lib/server-locale";

export default async function SignUpPage() {
  const locale = await getRequestLocale("en");

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6f8fb] px-5 py-10">
      <AccessApprovalCard locale={locale} />
    </main>
  );
}
