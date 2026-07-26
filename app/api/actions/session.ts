import { getCurrentWorkspaceContext, logWorkspaceContext } from "@/lib/current-workspace-context";

export async function resolveActionSession(request?: Request | null) {
  const session = await getCurrentWorkspaceContext(request);
  logWorkspaceContext("[workspace-context] action-session", session);

  return {
    workspaceId: session.workspace.id,
    userId: session.user.id
  };
}
