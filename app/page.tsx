import { Homepage } from "@/components/homepage";
import { getRequestLocale } from "@/lib/server-locale";

export default async function Page() {
  return <Homepage defaultLocale={await getRequestLocale("en")} />;
}
