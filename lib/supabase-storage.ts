import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

function supabaseStorageConfig() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET;

  if (!url || !serviceRoleKey || !bucket) {
    return null;
  }

  return {
    url,
    serviceRoleKey,
    bucket
  };
}

function safeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "upload";
}

function supabaseAdmin(config: NonNullable<ReturnType<typeof supabaseStorageConfig>>) {
  return createClient(config.url, config.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

export function isSupabaseStorageConfigured() {
  return Boolean(supabaseStorageConfig());
}

export function supabaseUploadPathForWorkspace(workspaceId: string, fileName: string) {
  return [
    "workspaces",
    workspaceId,
    "uploads",
    `${randomUUID()}-${safeFileName(fileName)}`
  ].join("/");
}

export function isWorkspaceSupabaseUploadPath(workspaceId: string, path: string) {
  return path.startsWith(`workspaces/${workspaceId}/uploads/`);
}

export async function createSupabaseSignedUpload(params: {
  workspaceId: string;
  fileName: string;
}) {
  const config = supabaseStorageConfig();

  if (!config) {
    throw new Error("Supabase Storage is not configured.");
  }

  const path = supabaseUploadPathForWorkspace(params.workspaceId, params.fileName);
  const { data, error } = await supabaseAdmin(config)
    .storage
    .from(config.bucket)
    .createSignedUploadUrl(path, { upsert: false });

  if (error || !data) {
    throw new Error(error?.message || "Failed to create signed upload URL.");
  }

  return {
    bucket: config.bucket,
    path: data.path,
    signedUrl: data.signedUrl,
    token: data.token
  };
}

export async function readSupabaseObjectText(path: string) {
  const config = supabaseStorageConfig();

  if (!config) {
    throw new Error("Supabase Storage is not configured.");
  }

  const { data, error } = await supabaseAdmin(config)
    .storage
    .from(config.bucket)
    .download(path);

  if (error || !data) {
    throw new Error(error?.message || "Uploaded file is empty or unavailable.");
  }

  return await data.text();
}

export async function getSupabaseObjectInfo(path: string) {
  const config = supabaseStorageConfig();

  if (!config) {
    throw new Error("Supabase Storage is not configured.");
  }

  const segments = path.split("/");
  const fileName = segments.pop();
  const directory = segments.join("/");

  if (!fileName || !directory) {
    throw new Error("Uploaded file path is invalid.");
  }

  const { data, error } = await supabaseAdmin(config)
    .storage
    .from(config.bucket)
    .list(directory, {
      limit: 1,
      search: fileName
    });

  if (error) {
    throw new Error(`Supabase Storage lookup failed: ${error.message}`);
  }

  const object = data?.find((item) => item.name === fileName);

  if (!object) {
    throw new Error("Uploaded file was not found in Supabase Storage.");
  }

  return object;
}
