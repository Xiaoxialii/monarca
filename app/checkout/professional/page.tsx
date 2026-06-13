import { PaymentPage } from "@/components/payment-page";
import { getRequestLocale } from "@/lib/server-locale";

export default async function ProfessionalCheckoutPage() {
  return <PaymentPage plan="professional" defaultLocale={await getRequestLocale("en")} />;
}
