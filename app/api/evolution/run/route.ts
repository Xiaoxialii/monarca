import { NextResponse } from "next/server";
import { syncCurrentClerkUser } from "@/lib/clerk-user-sync";
import { runSelfEvolvingCommerceOS } from "@/lib/evolution/self-evolving-commerce-os";
import type { SelfEvolvingCommerceInput } from "@/lib/evolution/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await syncCurrentClerkUser();
  if (!session) return NextResponse.json({ ok: false, message: "Unauthenticated." }, { status: 401 });

  const body = await request.json().catch(() => null) as SelfEvolvingCommerceInput | null;
  if (!body?.state?.skus?.length) {
    return NextResponse.json({ ok: false, message: "Commerce state with skus is required." }, { status: 400 });
  }

  const result = runSelfEvolvingCommerceOS({
    state: body.state,
    mode: body.mode ?? "suggest",
    actualOutcomes: body.actualOutcomes,
    currentPolicyWeights: body.currentPolicyWeights
  });

  return NextResponse.json({
    ok: true,
    self_evolving_commerce_os: result
  });
}
