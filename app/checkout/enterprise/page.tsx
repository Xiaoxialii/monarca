import { PaymentPage } from "@/components/payment-page";
import { getRequestLocale } from "@/lib/server-locale";

export default async function EnterpriseCheckoutPage() {
  return <PaymentPage plan="enterprise" defaultLocale={await getRequestLocale("en")} />;
}
