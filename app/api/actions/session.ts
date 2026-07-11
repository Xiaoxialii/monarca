import { syncCurrentClerkUser } from "@/lib/clerk-user-sync";

export async function resolveActionSession() {
  try {
    const session = await syncCurrentClerkUser();
    return {
      workspaceId: session?.workspace.id ?? "local-workspace",
      userId: session?.user.id ?? null
    };
  } catch {
    return {
      workspaceId: "local-workspace",
      userId: null
    };
  }
}
