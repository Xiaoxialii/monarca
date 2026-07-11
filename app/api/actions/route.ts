import { NextResponse } from "next/server";
import { listActionTrackingRecords } from "@/lib/optimization/action-tracking-store";
import type { ActionTrackingStatus } from "@/lib/optimization/action-tracking-types";
import { resolveActionSession } from "@/app/api/actions/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { workspaceId } = await resolveActionSession();
  const status = new URL(request.url).searchParams.get("status") as ActionTrackingStatus | null;
  const records = await listActionTrackingRecords({ workspaceId, status });

  return NextResponse.json({ ok: true, actions: records });
}
