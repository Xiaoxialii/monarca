import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const MAX_MESSAGE_LENGTH = 2000;
const CONSULTING_REQUEST_RECIPIENT =
  process.env.CONSULTING_REQUEST_RECIPIENT_EMAIL ||
  process.env.HELP_REQUEST_RECIPIENT_EMAIL ||
  "xiaoxia.li0922@gmail.com";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function text(value: unknown, maxLength = 500) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function optionalText(value: unknown, maxLength = 500) {
  const trimmed = text(value, maxLength);
  return trimmed || null;
}

function stringList(value: unknown) {
  if (!Array.isArray(value)) return null;

  const items = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20);

  return items.length ? JSON.stringify(items) : null;
}

function parseStringList(value: string | null) {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

async function sendConsultingRequestEmail(input: {
  id: string;
  name: string;
  email: string;
  companyName: string | null;
  painPoints: string | null;
  preferredMeetingTimes: string | null;
  message: string | null;
  source: string | null;
}) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    return { sent: false, reason: "RESEND_API_KEY is not configured" };
  }

  const from =
    process.env.CONSULTING_REQUEST_FROM_EMAIL ||
    process.env.HELP_REQUEST_FROM_EMAIL ||
    "Monarca AI <onboarding@resend.dev>";
  const painPoints = parseStringList(input.painPoints);
  const meetingTimes = parseStringList(input.preferredMeetingTimes);
  const rows: Array<[string, string]> = [
    ["Request ID", input.id],
    ["Name", input.name],
    ["Email / WeChat", input.email],
    ["Company / team", input.companyName || "-"],
    ["Preferred meeting times", meetingTimes.length ? meetingTimes.join(", ") : "-"],
    ["Problems to solve", painPoints.length ? painPoints.join(", ") : "-"],
    ["Source", input.source || "consulting_page"]
  ];
  const tableRows = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 12px;color:#64748b;vertical-align:top">${escapeHtml(label)}</td><td style="padding:6px 12px;color:#0f172a">${escapeHtml(value)}</td></tr>`
    )
    .join("");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: CONSULTING_REQUEST_RECIPIENT,
      subject: `[Monarca Consultation] ${input.name}${input.companyName ? ` - ${input.companyName}` : ""}`,
      html: `
        <div style="font-family:Arial,sans-serif;color:#0f172a">
          <h2>New consultation request</h2>
          <table style="border-collapse:collapse">${tableRows}</table>
          <h3>Additional context</h3>
          <p style="white-space:pre-wrap">${escapeHtml(input.message || "-")}</p>
        </div>
      `
    })
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    return { sent: false, reason: errorText || `Resend responded with ${response.status}` };
  }

  return { sent: true, reason: null };
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);

  if (!payload || typeof payload !== "object") {
    return NextResponse.json(
      { success: false, message: "Invalid request payload." },
      { status: 400 }
    );
  }

  const record = payload as Record<string, unknown>;
  const name = text(record.name, 200);
  const contact = text(record.email, 320);
  const email = contact.includes("@") ? contact.toLowerCase() : contact;

  if (!name || !email) {
    return NextResponse.json(
      { success: false, message: "Name and contact are required." },
      { status: 400 }
    );
  }

  try {
    const source = optionalText(record.source, 100) ?? "consulting_page";
    const requestRecord = await prisma.consultingRequest.create({
      data: {
        name,
        email,
        companyName: optionalText(record.companyName, 300),
        painPoints: stringList(record.painPoints),
        preferredMeetingTimes: stringList(record.preferredMeetingTimes),
        message: optionalText(record.message, MAX_MESSAGE_LENGTH),
        source
      }
    });
    const emailResult = await sendConsultingRequestEmail({
      id: requestRecord.id,
      name: requestRecord.name,
      email: requestRecord.email,
      companyName: requestRecord.companyName,
      painPoints: requestRecord.painPoints,
      preferredMeetingTimes: requestRecord.preferredMeetingTimes,
      message: requestRecord.message,
      source: requestRecord.source
    }).catch((error) => ({
      sent: false,
      reason: error instanceof Error ? error.message : "Unknown email error"
    }));

    if (!emailResult.sent) {
      console.warn("Consulting request email notification failed", {
        requestId: requestRecord.id,
        reason: emailResult.reason
      });
    }

    return NextResponse.json({
      success: true,
      message: "Consulting request submitted successfully.",
      emailNotification: {
        sent: emailResult.sent
      }
    });
  } catch {
    return NextResponse.json(
      { success: false, message: "Failed to submit consulting request." },
      { status: 500 }
    );
  }
}
