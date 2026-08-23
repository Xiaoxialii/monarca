import { NextResponse } from "next/server";
import { syncCurrentClerkUser } from "@/lib/clerk-user-sync";
import { trackOutcome } from "@/lib/feedback/outcome-tracker";
import { updatePolicyWeights } from "@/lib/feedback/policy-update";
import { generatePolicyReport } from "@/lib/llm/report-generator";
import type { CommerceState } from "@/lib/optimization/objective";
import { runClosedLoopPolicy } from "@/lib/policy/policy-runner";
import { assertProductAccessForUser } from "@/lib/product-access";
import { workspaceAuthErrorResponse } from "@/lib/workspace-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await syncCurrentClerkUser();
  if (!session) return NextResponse.json({ ok: false, message: "Unauthenticated." }, { status: 401 });
  try {
    await assertProductAccessForUser(session.user);
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);
    if (authResponse) return authResponse;
    throw error;
  }

  const body = await request.json().catch(() => null) as { state?: CommerceState; actualOutcomes?: Record<string, number> } | null;
  if (!body?.state?.skus?.length) {
    return NextResponse.json({ ok: false, message: "Commerce state with skus is required." }, { status: 400 });
  }

  const policyResult = runClosedLoopPolicy(body.state);
  const outcomes = policyResult.decisions
    .filter((decision) => body.actualOutcomes?.[decision.skuId] != null)
    .map((decision) => trackOutcome(decision, Number(body.actualOutcomes?.[decision.skuId])));
  const policyUpdate = updatePolicyWeights(outcomes, body.state.policyWeights);

  return NextResponse.json({
    ok: true,
    runtime: {
      ...policyResult,
      report: generatePolicyReport(policyResult.decisions),
      feedback: {
        outcomes,
        policyUpdate
      }
    }
  });
}
