import { GetObjectCommand, PutBucketCorsCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";

type StoredUpload = {
  bucket: string;
  endpoint: string;
  key: string;
};

let r2CorsSetup: Promise<void> | null = null;

function r2Config() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const endpoint = process.env.R2_ENDPOINT || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : null);
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;

  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
    return null;
  }

  return {
    endpoint,
    accessKeyId,
    secretAccessKey,
    bucket
  };
}

function safeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "upload";
}

export function isR2Configured() {
  return Boolean(r2Config());
}

function r2Client(config: NonNullable<ReturnType<typeof r2Config>>) {
  return new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey
    }
  });
}

function originValue(value: string | null | undefined) {
  if (!value) return null;

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export async function ensureR2UploadCors(extraOrigins: Array<string | null | undefined> = []) {
  const config = r2Config();

  if (!config) {
    throw new Error("R2 storage is not configured.");
  }

  if (r2CorsSetup) {
    return r2CorsSetup;
  }

  const allowedOrigins = Array.from(new Set([
    "https://www.monarcadata.com",
    "https://monarcadata.com",
    "http://localhost:3000",
    "http://localhost:3001",
    ...extraOrigins.map(originValue).filter((origin): origin is string => Boolean(origin))
  ]));

  r2CorsSetup = r2Client(config).send(
    new PutBucketCorsCommand({
      Bucket: config.bucket,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedHeaders: ["*"],
            AllowedMethods: ["PUT", "GET", "HEAD"],
            AllowedOrigins: allowedOrigins,
            ExposeHeaders: ["ETag"],
            MaxAgeSeconds: 3600
          }
        ]
      }
    })
  ).then(() => undefined).catch((error) => {
    r2CorsSetup = null;
    throw error;
  });

  return r2CorsSetup;
}

export function uploadKeyForWorkspace(workspaceId: string, fileName: string) {
  return [
    "workspaces",
    workspaceId,
    "uploads",
    `${randomUUID()}-${safeFileName(fileName)}`
  ].join("/");
}

export function isWorkspaceUploadKey(workspaceId: string, key: string) {
  return key.startsWith(`workspaces/${workspaceId}/uploads/`) ||
    key.startsWith(`workspaces/${workspaceId}/data-sources/`);
}

export async function createPresignedUploadUrl(params: {
  workspaceId: string;
  fileName: string;
  contentType?: string | null;
}) {
  const config = r2Config();

  if (!config) {
    throw new Error("R2 storage is not configured.");
  }

  const key = uploadKeyForWorkspace(params.workspaceId, params.fileName);
  const contentType = params.contentType || "application/octet-stream";
  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    ContentType: contentType,
    Metadata: {
      workspaceId: params.workspaceId,
      originalFileName: params.fileName
    }
  });

  return {
    bucket: config.bucket,
    key,
    uploadUrl: await getSignedUrl(r2Client(config), command, { expiresIn: 15 * 60 }),
    contentType
  };
}

async function streamToBuffer(stream: unknown) {
  if (!stream || typeof stream !== "object" || !("transformToByteArray" in stream)) {
    const chunks: Buffer[] = [];

    for await (const chunk of stream as AsyncIterable<Uint8Array | Buffer | string>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    return Buffer.concat(chunks);
  }

  return Buffer.from(await (stream as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray());
}

export async function readR2ObjectText(key: string) {
  const config = r2Config();

  if (!config) {
    throw new Error("R2 storage is not configured.");
  }

  const response = await r2Client(config).send(
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: key
    })
  );

  if (!response.Body) {
    throw new Error("Uploaded file is empty or unavailable.");
  }

  return (await streamToBuffer(response.Body)).toString("utf8");
}

export async function storeUploadInR2(params: {
  workspaceId: string;
  dataSourceId: string;
  file: File;
}): Promise<StoredUpload | null> {
  const config = r2Config();

  if (!config) {
    return null;
  }

  const key = [
    "workspaces",
    params.workspaceId,
    "data-sources",
    params.dataSourceId,
    `${randomUUID()}-${safeFileName(params.file.name)}`
  ].join("/");

  await r2Client(config).send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: Buffer.from(await params.file.arrayBuffer()),
      ContentLength: params.file.size,
      ContentType: params.file.type || "application/octet-stream",
      Metadata: {
        workspaceId: params.workspaceId,
        dataSourceId: params.dataSourceId,
        originalFileName: params.file.name
      }
    })
  );

  return {
    bucket: config.bucket,
    endpoint: config.endpoint,
    key
  };
}
