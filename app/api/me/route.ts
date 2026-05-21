import { NextResponse } from "next/server";
import { syncCurrentClerkUser } from "@/lib/clerk-user-sync";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await syncCurrentClerkUser();

  if (!session) {
    return NextResponse.json({ currentUser: null, currentWorkspace: null, currentRole: null }, { status: 401 });
  }

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
