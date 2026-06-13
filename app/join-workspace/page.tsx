import { JoinWorkspacePage } from "@/components/join-workspace-page";

export default async function JoinWorkspaceRoute({
  searchParams
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;
  return <JoinWorkspacePage token={typeof params.token === "string" ? params.token : ""} />;
}
