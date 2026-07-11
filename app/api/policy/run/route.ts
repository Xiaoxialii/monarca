import { NextResponse } from "next/server";
import { syncCurrentClerkUser } from "@/lib/clerk-user-sync";
import { PolicyEngine } from "@/lib/policy/policy-engine";
import type { CommerceState } from "@/lib/optimization/objective";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await syncCurrentClerkUser();
  if (!session) return NextResponse.json({ ok: false, message: "Unauthenticated." }, { status: 401 });

  const state = await request.json().catch(() => null) as CommerceState | null;
  if (!state?.skus?.length) {
    return NextResponse.json({ ok: false, message: "Commerce state with skus is required." }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    policy: new PolicyEngine().runPolicy(state)
  });
}
