import { NextResponse } from "next/server";
import { syncCurrentClerkUserIdentity } from "@/lib/clerk-user-sync";

export async function POST(request: Request) {
  void request;
  const result = await syncCurrentClerkUserIdentity();

  if (!result) {
    return NextResponse.json({ synced: false }, { status: 401 });
  }

  return NextResponse.json({
    synced: true,
    userId: result.user.id,
    workspaceId: result.workspace?.id ?? null,
    productAccessEnabled: result.user.productAccessEnabled === true
  });
}
