import { syncCurrentClerkUser } from "@/lib/clerk-user-sync";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await syncCurrentClerkUser();

  return children;
}
