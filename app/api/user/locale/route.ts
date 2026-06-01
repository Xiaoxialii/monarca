import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, workspaceAuthErrorResponse } from "@/lib/workspace-auth";

const supportedLocales = new Set(["en", "zh", "es-419", "es-MX"]);

function normalizeLocale(value: unknown) {
  return typeof value === "string" && supportedLocales.has(value) ? value : null;
}

export async function GET() {
  try {
    const session = await requireAuth();

    return NextResponse.json({
      ok: true,
      userId: session.user.id,
      locale: normalizeLocale(session.user.locale) ?? "en"
    });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);

    if (authResponse) {
      return authResponse;
    }

    return NextResponse.json({ ok: false, message: "Failed to load user language." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requireAuth();
    const payload = await request.json().catch(() => null);
    const locale = normalizeLocale(payload?.locale);

    if (!locale) {
      return NextResponse.json({ ok: false, message: "Unsupported language." }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: { locale }
    });

    return NextResponse.json({
      ok: true,
      userId: session.user.id,
      locale
    });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);

    if (authResponse) {
      return authResponse;
    }

    return NextResponse.json({ ok: false, message: "Failed to save user language." }, { status: 500 });
  }
}
