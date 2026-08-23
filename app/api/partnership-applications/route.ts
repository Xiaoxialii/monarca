import { NextResponse } from "next/server";
import { Prisma, WorkspaceRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  validateStorePartnershipApplication,
  APPLICATION_STATUS_OPTIONS,
  BUSINESS_STAGE_OPTIONS,
  FULFILLMENT_CAPABILITY_OPTIONS,
  labelForOption
} from "@/lib/partnership-applications";
import { requireWorkspaceRole, workspaceAuthErrorResponse } from "@/lib/workspace-auth";

export const dynamic = "force-dynamic";

const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 5;
const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();
const PARTNERSHIP_APPLICATION_RECIPIENT =
  process.env.PARTNERSHIP_APPLICATION_RECIPIENT_EMAIL ||
  process.env.CONSULTING_REQUEST_RECIPIENT_EMAIL ||
  process.env.HELP_REQUEST_RECIPIENT_EMAIL ||
  "";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function clientKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}

function rateLimit(request: Request) {
  const key = clientKey(request);
  const now = Date.now();
  const bucket = rateLimitBuckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (bucket.count >= RATE_LIMIT_MAX) {
    return false;
  }

  bucket.count += 1;
  return true;
}

async function sendInternalNotification(input: {
  id: string;
  name: string;
  email: string | null;
  wechat: string | null;
  businessStage: string;
  fulfillmentCapability: string;
  storeOrProductUrl: string | null;
}) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey || !PARTNERSHIP_APPLICATION_RECIPIENT) {
    return { sent: false };
  }

  const from =
    process.env.PARTNERSHIP_APPLICATION_FROM_EMAIL ||
    process.env.CONSULTING_REQUEST_FROM_EMAIL ||
    process.env.HELP_REQUEST_FROM_EMAIL ||
    "Monarca AI <onboarding@resend.dev>";
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  const detailUrl = baseUrl ? `${baseUrl}/admin/partnership-applications?id=${encodeURIComponent(input.id)}` : `/admin/partnership-applications?id=${input.id}`;
  const rows: Array<[string, string]> = [
    ["Name", input.name],
    ["Email", input.email || "-"],
    ["WeChat", input.wechat || "-"],
    ["Business stage", labelForOption(BUSINESS_STAGE_OPTIONS, input.businessStage)],
    ["Fulfillment", labelForOption(FULFILLMENT_CAPABILITY_OPTIONS, input.fulfillmentCapability)],
    ["Store / product URL", input.storeOrProductUrl || "-"],
    ["Admin detail", detailUrl]
  ];

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: PARTNERSHIP_APPLICATION_RECIPIENT,
      subject: `[Monarca Application] ${input.name}`,
      html: `
        <div style="font-family:Arial,sans-serif;color:#0f172a">
          <h2>New store partnership application</h2>
          <table style="border-collapse:collapse">
            ${rows.map(([label, value]) => `<tr><td style="padding:6px 12px;color:#64748b;vertical-align:top">${escapeHtml(label)}</td><td style="padding:6px 12px;color:#0f172a">${escapeHtml(value)}</td></tr>`).join("")}
          </table>
        </div>
      `
    })
  }).catch(() => null);

  return { sent: true };
}

export async function POST(request: Request) {
  if (!rateLimit(request)) {
    return NextResponse.json(
      { success: false, message: "提交过于频繁，请稍后再试。", fieldErrors: {} },
      { status: 429 }
    );
  }

  const payload = await request.json().catch(() => null);

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return NextResponse.json(
      { success: false, message: "申请内容格式不正确。", fieldErrors: {} },
      { status: 400 }
    );
  }

  const validation = validateStorePartnershipApplication(payload);

  if (!validation.success) {
    return NextResponse.json(
      { success: false, message: validation.message, fieldErrors: validation.fieldErrors },
      { status: validation.honeypot ? 400 : 422 }
    );
  }

  const duplicateSince = new Date(Date.now() - DUPLICATE_WINDOW_MS);
  const duplicate = await prisma.storePartnershipApplication.findFirst({
    where: {
      submittedAt: { gte: duplicateSince },
      OR: [
        ...(validation.data.email ? [{ email: validation.data.email }] : []),
        ...(validation.data.wechat ? [{ wechat: validation.data.wechat }] : [])
      ]
    },
    select: { id: true }
  });

  if (duplicate) {
    return NextResponse.json(
      {
        success: false,
        message: "我们已收到你近期提交的申请，请勿重复提交。Monarca 会通过邮箱或微信与你联系。",
        fieldErrors: {}
      },
      { status: 409 }
    );
  }

  try {
    const application = await prisma.storePartnershipApplication.create({
      data: {
        name: validation.data.name,
        email: validation.data.email,
        wechat: validation.data.wechat,
        businessStage: validation.data.businessStage,
        storeOrProductUrl: validation.data.storeOrProductUrl,
        salesChannels: validation.data.salesChannels as Prisma.InputJsonValue,
        otherSalesChannel: validation.data.otherSalesChannel,
        fulfillmentCapability: validation.data.fulfillmentCapability,
        requestedServices: validation.data.requestedServices as Prisma.InputJsonValue,
        otherRequestedService: validation.data.otherRequestedService,
        businessDescription: validation.data.businessDescription,
        consentAccepted: true,
        source: validation.data.source
      }
    });

    void sendInternalNotification({
      id: application.id,
      name: application.name,
      email: application.email,
      wechat: application.wechat,
      businessStage: application.businessStage,
      fulfillmentCapability: application.fulfillmentCapability,
      storeOrProductUrl: application.storeOrProductUrl
    });

    return NextResponse.json({
      success: true,
      application: {
        id: application.id,
        submittedAt: application.submittedAt
      },
      message: "申请已收到。"
    });
  } catch {
    return NextResponse.json(
      { success: false, message: "申请提交失败，请稍后重试或通过邮箱/微信联系 Monarca。", fieldErrors: {} },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    await requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN], request);
    const url = new URL(request.url);
    const page = Math.max(1, Number(url.searchParams.get("page") || "1") || 1);
    const pageSize = Math.min(50, Math.max(10, Number(url.searchParams.get("pageSize") || "20") || 20));
    const search = (url.searchParams.get("q") || "").trim();
    const status = (url.searchParams.get("status") || "").trim().toUpperCase();
    const businessStage = (url.searchParams.get("businessStage") || "").trim().toUpperCase();
    const statuses = new Set(APPLICATION_STATUS_OPTIONS.map((item) => item.value));
    const stages = new Set(BUSINESS_STAGE_OPTIONS.map((item) => item.value));
    const where: Prisma.StorePartnershipApplicationWhereInput = {
      ...(statuses.has(status as never) ? { status: status as never } : {}),
      ...(stages.has(businessStage as never) ? { businessStage: businessStage as never } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
              { wechat: { contains: search, mode: "insensitive" } },
              { storeOrProductUrl: { contains: search, mode: "insensitive" } }
            ]
          }
        : {})
    };
    const [items, total] = await Promise.all([
      prisma.storePartnershipApplication.findMany({
        where,
        orderBy: { submittedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      prisma.storePartnershipApplication.count({ where })
    ]);

    return NextResponse.json({ success: true, items, total, page, pageSize });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);
    if (authResponse) return authResponse;

    return NextResponse.json(
      { success: false, message: "Failed to load partnership applications." },
      { status: 500 }
    );
  }
}
