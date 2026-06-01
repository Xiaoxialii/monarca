import { NextResponse } from "next/server";
import { createHelpRequest } from "@/lib/help-requests";
import { checkRateLimit } from "@/lib/basic-rate-limit";

export const dynamic = "force-dynamic";

const MAX_TEXT_LENGTH = 4000;

function truncate(value: unknown) {
  return typeof value === "string" ? value.slice(0, MAX_TEXT_LENGTH) : undefined;
}

export async function POST(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const rateLimitKey = `help:${forwardedFor || "unknown"}`;
  const rateLimit = checkRateLimit(rateLimitKey, { limit: 5, windowMs: 10 * 60 * 1000 });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { ok: false, message: "Too many help requests. Please try again later." },
      { status: 429 }
    );
  }

  const payload = await request.json().catch(() => null);

  if (!payload || typeof payload !== "object") {
    return NextResponse.json(
      { ok: false, message: "Invalid help request payload." },
      { status: 400 }
    );
  }

  try {
    const result = await createHelpRequest({
      source: payload.source === "checkout" ? "checkout" : "support",
      plan: typeof payload.plan === "string" ? payload.plan : undefined,
      type: typeof payload.type === "string" ? payload.type : undefined,
      priority: typeof payload.priority === "string" ? payload.priority : undefined,
      name: truncate(payload.name),
      email: truncate(payload.email),
      company: truncate(payload.company),
      workspaceName: truncate(payload.workspaceName),
      subject: truncate(payload.subject),
      description: truncate(payload.description),
      notes: truncate(payload.notes),
      locale: typeof payload.locale === "string" ? payload.locale : undefined
    });

    return NextResponse.json({
      ok: true,
      ticketId: result.ticket.id,
      recipient: result.recipient,
      emailSent: result.emailSent
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create help request.";

    return NextResponse.json(
      { ok: false, message },
      { status: 500 }
    );
  }
}
