import { PaymentPage } from "@/components/payment-page";
import { getRequestLocale } from "@/lib/server-locale";

export default async function DatabaseSetupCheckoutPage() {
  return <PaymentPage plan="database-setup" defaultLocale={await getRequestLocale("en")} />;
}
