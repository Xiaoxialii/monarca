import { NextResponse } from "next/server";
import { getCurrentWorkspaceContext } from "@/lib/current-workspace-context";
import { workspaceAuthErrorResponse } from "@/lib/workspace-auth";

export async function POST(request: Request) {
  const result = await getCurrentWorkspaceContext(request).catch((error) => {
    const authResponse = workspaceAuthErrorResponse(error);
    if (authResponse) return authResponse;
    throw error;
  });

  if (!result) {
    return NextResponse.json({ synced: false }, { status: 401 });
  }

  if (result instanceof NextResponse) return result;

  return NextResponse.json({
    synced: true,
    userId: result.user.id,
    workspaceId: result.workspace.id
  });
}
