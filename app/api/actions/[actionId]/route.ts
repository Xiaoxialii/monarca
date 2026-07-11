import { NextResponse } from "next/server";
import { getActionTrackingRecord } from "@/lib/optimization/action-tracking-store";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ actionId: string }> }) {
  const { actionId } = await context.params;
  const record = await getActionTrackingRecord(actionId);

  if (!record) return NextResponse.json({ ok: false, message: "Action not found." }, { status: 404 });

  return NextResponse.json({ ok: true, action: record });
}
