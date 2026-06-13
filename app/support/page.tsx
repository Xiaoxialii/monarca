import { SupportPage } from "@/components/support-page";
import { getRequestLocale } from "@/lib/server-locale";

export default async function SupportTicketPage() {
  return <SupportPage defaultLocale={await getRequestLocale("en")} />;
}
