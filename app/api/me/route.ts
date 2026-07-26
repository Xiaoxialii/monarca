import { NextResponse } from "next/server";
import { getCurrentWorkspaceContext } from "@/lib/current-workspace-context";
import { workspaceAuthErrorResponse } from "@/lib/workspace-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getCurrentWorkspaceContext(request).catch((error) => {
    const authResponse = workspaceAuthErrorResponse(error);
    if (authResponse) return authResponse;
    throw error;
  });

  if (!session) {
    return NextResponse.json({ currentUser: null, currentWorkspace: null, currentRole: null }, { status: 401 });
  }

  if (session instanceof NextResponse) return session;

  return NextResponse.json({
    currentUser: {
      id: session.user.id,
      clerkUserId: session.user.clerkUserId,
      email: session.user.email,
      name: session.user.name,
      avatarUrl: session.user.avatarUrl
    },
    currentWorkspace: {
      id: session.workspace.id,
      slug: session.workspace.slug,
      name: session.workspace.name
    },
    currentRole: session.membership.role.toLowerCase(),
    membershipStatus: session.membership.status.toLowerCase()
  });
}
