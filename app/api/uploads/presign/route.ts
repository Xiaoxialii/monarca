import { NextResponse } from "next/server";
import { WorkspaceRole } from "@prisma/client";
import { BillingEntitlementError, requireCanConnectDataSource } from "@/lib/billing/entitlements";
import { fileExtension } from "@/lib/file-upload-schema";
import { createSupabaseSignedUpload, isSupabaseStorageConfigured } from "@/lib/supabase-storage";
import { requireWorkspaceRole, workspaceAuthErrorResponse } from "@/lib/workspace-auth";

export const runtime = "nodejs";

const MAX_DIRECT_UPLOAD_BYTES = 100 * 1024 * 1024;
const MAX_FILE_NAME_LENGTH = 180;

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  try {
    const session = await requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN]);
    await requireCanConnectDataSource(session.workspace.id);

    if (!isSupabaseStorageConfigured()) {
      return NextResponse.json(
        { ok: false, message: "Supabase Storage is not configured." },
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

    if (fileSize > MAX_DIRECT_UPLOAD_BYTES) {
      return NextResponse.json(
        { ok: false, message: `File is too large. Maximum upload size is ${Math.floor(MAX_DIRECT_UPLOAD_BYTES / 1024 / 1024)}MB.` },
        { status: 413 }
      );
    }

    const upload = await createSupabaseSignedUpload({
      workspaceId: session.workspace.id,
      fileName
    });

    return NextResponse.json({
      ok: true,
      provider: "supabase",
      uploadUrl: upload.signedUrl,
      path: upload.path,
      token: upload.token,
      bucket: upload.bucket,
      maxBytes: MAX_DIRECT_UPLOAD_BYTES
    });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);

    if (authResponse) return authResponse;

    if (error instanceof BillingEntitlementError) {
      return NextResponse.json(
        { ok: false, code: error.code, message: error.message, upgradeUrl: "/settings/billing" },
        { status: error.status }
      );
    }

    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Failed to prepare upload." },
      { status: 500 }
    );
  }
}
