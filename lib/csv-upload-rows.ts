import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { readR2ObjectText } from "@/lib/r2-storage";
import { getSupabaseObjectInfo, readSupabaseObjectText } from "@/lib/supabase-storage";

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
  const headers = lines[0] ? splitCsvLine(lines[0]).filter(Boolean) : [];

  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

export async function readCsvRowsFromLocalFile(filePath: string) {
  const resolved = path.resolve(filePath);
  const workspaceRoot = path.resolve(process.cwd());
  const relativePath = path.relative(workspaceRoot, resolved);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error("CSV file path is outside the workspace");
  }

  const fileStat = await stat(resolved);
  const cacheKey = `local:${resolved}:${fileStat.mtimeMs}:${fileStat.size}`;
  const cached = csvRowsCache.get(cacheKey);

  if (cached) return cached;

  const rowsPromise = readFile(resolved, "utf8").then(csvRowsFromText);
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

  if (typeof storedFilePath === "string" && storedFilePath) {
    return readCsvRowsFromLocalFile(storedFilePath);
  }

  const storage = asRecord(config.storage);

  if (storage.provider === "cloudflare-r2" && typeof storage.key === "string" && storage.key) {
    const cacheKey = `r2:${storage.key}`;
    const cached = csvRowsCache.get(cacheKey);

    if (cached) return cached;

    const rowsPromise = readR2ObjectText(storage.key).then(csvRowsFromText);
    while (csvRowsCache.size >= maxCachedCsvFiles) {
      const oldestKey = csvRowsCache.keys().next().value;
      if (!oldestKey) break;
      csvRowsCache.delete(oldestKey);
    }
    csvRowsCache.set(cacheKey, rowsPromise);
    return rowsPromise;
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
    const cacheKey = `supabase:${storage.path}:${objectVersion}`;
    const cached = csvRowsCache.get(cacheKey);

    if (cached) return cached;

    const rowsPromise = readSupabaseObjectText(storage.path).then(csvRowsFromText);
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
