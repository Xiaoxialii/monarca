import { NextResponse } from "next/server";
import { WorkspaceRole } from "@prisma/client";
import {
  BillingEntitlementError,
  billingEntitlementMessage,
  billingLocaleFromRequest,
  requireCanConnectDataSource
} from "@/lib/billing/entitlements";
import { fileExtension } from "@/lib/file-upload-schema";
import { createPresignedUploadUrl, ensureR2UploadCors, isR2Configured } from "@/lib/r2-storage";
import { FILE_UPLOAD_MAX_BYTES, FILE_UPLOAD_MAX_MB } from "@/lib/upload-limits";
import { requireWorkspaceRole, workspaceAuthErrorResponse } from "@/lib/workspace-auth";

export const runtime = "nodejs";

const MAX_FILE_NAME_LENGTH = 180;

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  try {
    const session = await requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN]);
    await requireCanConnectDataSource(session.workspace.id);

    if (!isR2Configured()) {
      return NextResponse.json(
        { ok: false, message: "R2 storage is not configured." },
        { status: 500 }
      );
    }

    const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
    const fileName = stringValue(payload?.fileName);
    const fileSize = typeof payload?.fileSize === "number" ? payload.fileSize : Number(payload?.fileSize);
    const extension = fileExtension(fileName);

    if (!fileName) {
      return NextResponse.json({ ok: false, message: "File name is required." }, { status: 400 });
    }

    if (fileName.length > MAX_FILE_NAME_LENGTH) {
      return NextResponse.json(
        { ok: false, message: `File name is too long. Maximum supported length: ${MAX_FILE_NAME_LENGTH}.` },
        { status: 400 }
      );
    }

    if (!["csv", "xls", "xlsx"].includes(extension)) {
      return NextResponse.json(
        { ok: false, message: "Only CSV, XLS, and XLSX files are supported." },
        { status: 400 }
      );
    }

    if (!Number.isFinite(fileSize) || fileSize <= 0) {
      return NextResponse.json({ ok: false, message: "File size is required." }, { status: 400 });
    }

    if (fileSize > FILE_UPLOAD_MAX_BYTES) {
      return NextResponse.json(
        { ok: false, message: `File is too large. Maximum upload size is ${FILE_UPLOAD_MAX_MB}MB.` },
        { status: 413 }
      );
    }

    await ensureR2UploadCors([
      request.headers.get("origin"),
      request.headers.get("referer")
    ]).catch((error) => {
      console.warn("Failed to ensure R2 upload CORS; returning presigned URL anyway", error);
    });

    const upload = await createPresignedUploadUrl({
      workspaceId: session.workspace.id,
      fileName,
      contentType: stringValue(payload?.contentType) || "application/octet-stream"
    });

    console.info("R2 presign upload prepared", {
      ok: true,
      provider: "cloudflare-r2",
      bucket: upload.bucket,
      endpointOrigin: new URL(upload.endpoint).origin,
      key: upload.key,
      contentType: upload.contentType,
      fileSize
    });

    return NextResponse.json({
      ok: true,
      provider: "cloudflare-r2",
      uploadUrl: upload.uploadUrl,
      uploadOrigin: new URL(upload.uploadUrl).origin,
      key: upload.key,
      path: upload.key,
      bucket: upload.bucket,
      contentType: upload.contentType,
      maxBytes: FILE_UPLOAD_MAX_BYTES
    });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);

    if (authResponse) return authResponse;

    if (error instanceof BillingEntitlementError) {
      return NextResponse.json(
        {
          ok: false,
          code: error.code,
          message: billingEntitlementMessage(error, billingLocaleFromRequest(request)),
          upgradeUrl: "/settings/billing"
        },
        { status: error.status }
      );
    }

    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Failed to prepare upload." },
      { status: 500 }
    );
  }
}
