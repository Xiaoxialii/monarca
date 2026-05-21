import { NextResponse } from "next/server";
import { syncCurrentClerkUser } from "@/lib/clerk-user-sync";

export async function POST() {
  const result = await syncCurrentClerkUser();

  if (!result) {
    return NextResponse.json({ synced: false }, { status: 401 });
  }

  return NextResponse.json({
    synced: true,
    userId: result.user.id,
    workspaceId: result.workspace.id
  });
}
