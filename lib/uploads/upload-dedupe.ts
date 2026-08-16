import { createHash } from "node:crypto";
import { ConnectionStatus, DataSourceType, type PrismaClient } from "@prisma/client";

type UploadDuplicateLookup = {
  workspaceId: string;
  fileName: string;
  fileSize: number;
  contentHash: string;
  sourceType: DataSourceType;
};

export function uploadContentHash(content: Buffer | Uint8Array | ArrayBuffer) {
  const buffer = content instanceof ArrayBuffer
    ? Buffer.from(content)
    : Buffer.from(content.buffer, content.byteOffset, content.byteLength);
  return createHash("sha256").update(buffer).digest("hex");
}

export function normalizedUploadFileName(fileName: string) {
  return fileName.trim().toLowerCase().replace(/\s+/g, " ");
}

export function uploadSourceFingerprint(input: {
  fileName: string;
  fileSize: number;
  contentHash: string;
  sourceType: DataSourceType;
}) {
  return createHash("sha256")
    .update([
      input.sourceType,
      normalizedUploadFileName(input.fileName),
      String(input.fileSize),
      input.contentHash
    ].join(":"))
    .digest("hex");
}

export async function findDuplicateUploadedDataSource(
  prisma: Pick<PrismaClient, "dataSourceConnection">,
  input: UploadDuplicateLookup
) {
  const sourceFingerprint = uploadSourceFingerprint(input);

  const duplicate = await prisma.dataSourceConnection.findFirst({
    where: {
      workspaceId: input.workspaceId,
      isActive: true,
      type: input.sourceType,
      status: {
        in: [ConnectionStatus.CONNECTED, ConnectionStatus.PENDING]
      },
      OR: [
        { contentHash: input.contentHash },
        { sourceFingerprint }
      ]
    },
    orderBy: {
      updatedAt: "desc"
    }
  });

  return {
    duplicate,
    sourceFingerprint
  };
}
