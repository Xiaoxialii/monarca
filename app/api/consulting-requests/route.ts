import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const MAX_MESSAGE_LENGTH = 2000;

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
    await prisma.consultingRequest.create({
      data: {
        name,
        email,
        companyName: optionalText(record.companyName, 300),
        role: optionalText(record.role, 200),
        dataSources: stringList(record.dataSources),
        painPoints: stringList(record.painPoints),
        message: optionalText(record.message, MAX_MESSAGE_LENGTH),
        source: optionalText(record.source, 100) ?? "consulting_page"
      }
    });

    return NextResponse.json({
      success: true,
      message: "Consulting request submitted successfully."
    });
  } catch {
    return NextResponse.json(
      { success: false, message: "Failed to submit consulting request." },
      { status: 500 }
    );
  }
}
