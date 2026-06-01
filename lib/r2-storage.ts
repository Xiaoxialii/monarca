import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";

type StoredUpload = {
  bucket: string;
  endpoint: string;
  key: string;
  url: string | null;
};

function r2Config() {
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;

  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
    return null;
  }

  return {
    endpoint,
    accessKeyId,
    secretAccessKey,
    bucket,
    publicBaseUrl: process.env.R2_PUBLIC_BASE_URL
  };
}

function safeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "upload";
}

export function isR2Configured() {
  return Boolean(r2Config());
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

  const client = new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey
    }
  });

  await client.send(
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
    key,
    url: config.publicBaseUrl ? `${config.publicBaseUrl.replace(/\/$/, "")}/${key}` : null
  };
}
