import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

function safePathPart(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 140) || "upload";
}

export function localUploadPathForDataSource(params: {
  workspaceId: string;
  dataSourceId: string;
  fileName: string;
}) {
  const uploadRoot = process.env.VERCEL ? os.tmpdir() : process.cwd();

  return path.join(
    uploadRoot,
    ".data-source-uploads",
    safePathPart(params.workspaceId),
    safePathPart(params.dataSourceId),
    safePathPart(params.fileName)
  );
}

export async function storeUploadLocally(params: {
  workspaceId: string;
  dataSourceId: string;
  file: File;
}) {
  const filePath = localUploadPathForDataSource({
    workspaceId: params.workspaceId,
    dataSourceId: params.dataSourceId,
    fileName: params.file.name
  });

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, Buffer.from(await params.file.arrayBuffer()));

  return {
    provider: "local-file",
    path: filePath
  };
}
