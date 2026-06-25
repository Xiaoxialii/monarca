import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { canonicalUploadHeaders, excelRecordsFromBuffer, fileExtension } from "@/lib/file-upload-schema";
import { readR2ObjectBuffer, readR2ObjectText } from "@/lib/r2-storage";
import { getSupabaseObjectInfo, readSupabaseObjectBuffer, readSupabaseObjectText } from "@/lib/supabase-storage";

type CsvRows = Array<Record<string, unknown>>;

const csvRowsCache = new Map<string, Promise<CsvRows>>();
const maxCachedCsvFiles = 4;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function splitCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const nextCharacter = line[index + 1];

    if (character === "\"" && nextCharacter === "\"") {
      current += "\"";
      index += 1;
      continue;
    }

    if (character === "\"") {
      inQuotes = !inQuotes;
      continue;
    }

    if (character === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += character;
  }

  values.push(current.trim());
  return values;
}

export function csvRowsFromText(text: string) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const headers = canonicalUploadHeaders(lines[0] ? splitCsvLine(lines[0]).filter(Boolean) : []);

  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

export async function excelRowsFromBuffer(buffer: ArrayBuffer | Uint8Array | Buffer) {
  return excelRecordsFromBuffer("uploaded.xlsx", buffer);
}

export async function readCsvRowsFromLocalFile(filePath: string) {
  return readUploadRowsFromLocalFile(filePath);
}

async function readUploadRowsFromLocalFile(filePath: string, fileName?: string | null) {
  const resolved = path.resolve(filePath);
  const workspaceRoot = path.resolve(process.cwd());
  const relativePath = path.relative(workspaceRoot, resolved);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error("Uploaded file path is outside the workspace");
  }

  const fileStat = await stat(resolved);
  const extension = fileExtension(fileName || resolved);
  const cacheKey = `local:${extension}:${resolved}:${fileStat.mtimeMs}:${fileStat.size}`;
  const cached = csvRowsCache.get(cacheKey);

  if (cached) return cached;

  const rowsPromise = extension === "xls" || extension === "xlsx"
    ? readFile(resolved).then(excelRowsFromBuffer)
    : readFile(resolved, "utf8").then(csvRowsFromText);
  while (csvRowsCache.size >= maxCachedCsvFiles) {
    const oldestKey = csvRowsCache.keys().next().value;
    if (!oldestKey) break;
    csvRowsCache.delete(oldestKey);
  }
  csvRowsCache.set(cacheKey, rowsPromise);
  return rowsPromise;
}

export async function readCsvRowsFromStorageConfig(config: Record<string, unknown>) {
  const storedFilePath = config.storedFilePath;
  const configuredFileName = typeof config.fileName === "string" ? config.fileName : null;
  const extension = fileExtension(configuredFileName || "");

  const storage = asRecord(config.storage);
  const storageProvider = typeof config.storageProvider === "string" ? config.storageProvider : null;
  const objectKey = typeof config.objectKey === "string" && config.objectKey
    ? config.objectKey
    : typeof config.storagePath === "string" && config.storagePath
      ? config.storagePath
      : typeof storage.key === "string" && storage.key
        ? storage.key
        : null;

  if ((storage.provider === "cloudflare-r2" || storageProvider === "r2") && objectKey) {
    const objectExtension = extension || fileExtension(objectKey);
    const cacheKey = `r2:${objectExtension}:${objectKey}`;
    const cached = csvRowsCache.get(cacheKey);

    if (cached) return cached;

    const rowsPromise = objectExtension === "xls" || objectExtension === "xlsx"
      ? readR2ObjectBuffer(objectKey).then(excelRowsFromBuffer)
      : readR2ObjectText(objectKey).then(csvRowsFromText);
    while (csvRowsCache.size >= maxCachedCsvFiles) {
      const oldestKey = csvRowsCache.keys().next().value;
      if (!oldestKey) break;
      csvRowsCache.delete(oldestKey);
    }
    csvRowsCache.set(cacheKey, rowsPromise);
    return rowsPromise;
  }

  if (typeof config.inlineFileBase64 === "string" && config.inlineFileBase64) {
    const cacheKey = `inline:${extension}:${config.inlineFileBase64.length}:${String(config.fileSize ?? "")}`;
    const cached = csvRowsCache.get(cacheKey);

    if (cached) return cached;

    const buffer = Buffer.from(config.inlineFileBase64, "base64");
    const rowsPromise = extension === "xls" || extension === "xlsx"
      ? excelRowsFromBuffer(buffer)
      : Promise.resolve(csvRowsFromText(buffer.toString("utf8")));
    while (csvRowsCache.size >= maxCachedCsvFiles) {
      const oldestKey = csvRowsCache.keys().next().value;
      if (!oldestKey) break;
      csvRowsCache.delete(oldestKey);
    }
    csvRowsCache.set(cacheKey, rowsPromise);
    return rowsPromise;
  }

  if (typeof storedFilePath === "string" && storedFilePath) {
    return readUploadRowsFromLocalFile(storedFilePath, configuredFileName);
  }

  if (storage.provider === "supabase-storage" && typeof storage.path === "string" && storage.path) {
    const objectInfo = await getSupabaseObjectInfo(storage.path).catch(() => null);
    const objectVersion = [
      typeof objectInfo?.updated_at === "string" ? objectInfo.updated_at : null,
      typeof objectInfo?.created_at === "string" ? objectInfo.created_at : null,
      typeof objectInfo?.metadata === "object" && objectInfo.metadata
        ? JSON.stringify(objectInfo.metadata)
        : null,
      typeof config.fileSize === "number" ? config.fileSize : null
    ].filter(Boolean).join(":");
    const objectExtension = extension || fileExtension(storage.path);
    const cacheKey = `supabase:${objectExtension}:${storage.path}:${objectVersion}`;
    const cached = csvRowsCache.get(cacheKey);

    if (cached) return cached;

    const rowsPromise = objectExtension === "xls" || objectExtension === "xlsx"
      ? readSupabaseObjectBuffer(storage.path).then(excelRowsFromBuffer)
      : readSupabaseObjectText(storage.path).then(csvRowsFromText);
    while (csvRowsCache.size >= maxCachedCsvFiles) {
      const oldestKey = csvRowsCache.keys().next().value;
      if (!oldestKey) break;
      csvRowsCache.delete(oldestKey);
    }
    csvRowsCache.set(cacheKey, rowsPromise);
    return rowsPromise;
  }

  return null;
}
