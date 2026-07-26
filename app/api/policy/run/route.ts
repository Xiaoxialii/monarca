import { NextResponse } from "next/server";
import { getCurrentWorkspaceContext, logWorkspaceContext } from "@/lib/current-workspace-context";
import { workspaceAuthErrorResponse } from "@/lib/workspace-auth";
import { PolicyEngine } from "@/lib/policy/policy-engine";
import type { CommerceState } from "@/lib/optimization/objective";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await getCurrentWorkspaceContext(request).catch((error) => {
    const authResponse = workspaceAuthErrorResponse(error);
    if (authResponse) return authResponse;
    throw error;
  });
  if (session instanceof NextResponse) return session;
  logWorkspaceContext("[workspace-context] policy.run.POST", session);

  const state = await request.json().catch(() => null) as CommerceState | null;
  if (!state?.skus?.length) {
    return NextResponse.json({ ok: false, message: "Commerce state with skus is required." }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    policy: new PolicyEngine().runPolicy(state)
  });
}
