const MAX_CSV_ROWS = 300_000;
const MAX_CSV_COLUMNS = 60;
const MAX_EXCEL_ROWS = 300_000;
const MAX_EXCEL_COLUMNS = 240;

export function fileExtension(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

export function tableNameFromFile(fileName: string) {
  const baseName = fileName.replace(/\.[^.]+$/, "");

  if (/kpi|综合KPI|网点综合/i.test(baseName)) return "branch_kpi_daily";
  if (/分母|denominator/i.test(baseName)) return "ticket_resolution_denominator";
  if (/未解决|unresolved/i.test(baseName)) return "ticket_unresolved_detail";

  return baseName.replace(/[^a-zA-Z0-9_]+/g, "_").replace(/^_+|_+$/g, "") || "uploaded_file";
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

function normalizeCsvNumber(value: string) {
  const cleaned = value.replace(/[$,%+,\s]/g, "");
  return cleaned ? Number(cleaned) : Number.NaN;
}

function isPresentCellValue(value: unknown) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return String(value).trim().length > 0;
}

function normalizeHeaderToken(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function semanticHeaderName(header: string) {
  const raw = header.trim();
  const normalized = normalizeHeaderToken(raw);
  const preserveCanonical = new Set([
    "order_id",
    "order_date",
    "customer_id",
    "product_id",
    "category",
    "quantity",
    "unit_price",
    "gross_sales",
    "net_sales",
    "total_paid",
    "discount_amount",
    "is_returned",
    "customer_rating",
    "fulfillment_days",
    "sales_channel",
    "country",
    "date",
    "branch_name",
    "total_score",
    "rating",
    "national_rank",
    "province_rank",
    "pickup_score",
    "timeliness_score",
    "delivery_standard_score",
    "problem_resolution_score",
    "bonus_penalty_score",
    "ticket_id",
    "ticket_type",
    "customer_request_type",
    "service_scene",
    "unresolved_reason",
    "is_followup_unresolved",
    "is_second_ticket",
    "is_repeat_contact",
    "is_urge_order",
    "is_counted_in_resolution_rate"
  ]);

  if (preserveCanonical.has(normalized)) return normalized;

  const haystack = `${raw} ${normalized}`.toLowerCase();
  const groupedBusinessHeader = raw.includes("_") && /率|得分|总分|分子|分母|率值|零分线|满分线|占比|减分|加分/.test(raw);

  if (groupedBusinessHeader) {
    return normalized || raw.replace(/\s+/g, "_") || "field";
  }

  if (/日期|时间|(^|_)date($|_)|(^|_)time($|_)|created_at|updated_at|timestamp/.test(haystack)) return "date";
  if (/网点|责任网点|branch|site|station/.test(haystack)) return "branch_name";
  if (/总分|total.*score|kpi.*score/.test(haystack)) return "total_score";
  if (/评级|等级|rating|grade/.test(haystack)) return "rating";
  if (/全国.*排名|national.*rank/.test(haystack)) return "national_rank";
  if (/省区.*排名|省.*排名|province.*rank/.test(haystack)) return "province_rank";
  if (/散件|揽收|pickup/.test(haystack)) return "pickup_score";
  if (/时效|timeliness|履约/.test(haystack)) return "timeliness_score";
  if (/投递.*规范|delivery.*standard/.test(haystack)) return "delivery_standard_score";
  if (/问题.*解决|problem.*resolution.*score/.test(haystack)) return "problem_resolution_score";
  if (/加减分|加.*分|扣.*分|bonus|penalty/.test(haystack)) return "bonus_penalty_score";
  if (/工单.*id|工单号|ticket.*id|case.*id/.test(haystack)) return "ticket_id";
  if (/工单.*类型|ticket.*type/.test(haystack)) return "ticket_type";
  if (/客户.*求助|求助.*类型|customer.*request/.test(haystack)) return "customer_request_type";
  if (/服务.*场景|场景|service.*scene/.test(haystack)) return "service_scene";
  if (/未解决.*原因|原因|unresolved.*reason/.test(haystack)) return "unresolved_reason";
  if (/回访.*未解决|followup.*unresolved/.test(haystack)) return "is_followup_unresolved";
  if (/二次.*工单|second.*ticket/.test(haystack)) return "is_second_ticket";
  if (/重复.*进线|repeat.*contact/.test(haystack)) return "is_repeat_contact";
  if (/催单|urge/.test(haystack)) return "is_urge_order";
  if (/是否.*纳入|分母|counted.*resolution/.test(haystack)) return "is_counted_in_resolution_rate";

  return normalized || raw.replace(/\s+/g, "_") || "field";
}

function isLikelyDataRow(row: Array<string | number | boolean | Date | null>) {
  const values = row.map((cell) => String(cell ?? "").trim()).filter(Boolean);

  if (values.length === 0) return false;

  const dateLike = values.filter((value) => /^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(value) || /^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/.test(value)).length;
  const numericLike = values.filter((value) => Number.isFinite(normalizeCsvNumber(value))).length;

  return (dateLike > 0 && numericLike >= 2) || numericLike / values.length >= 0.55;
}

function fillMergedHeaderRows(
  rows: Array<Array<string | number | boolean | Date | null>>,
  merges: Array<{ s?: { r?: number; c?: number }; e?: { r?: number; c?: number } }> = []
) {
  const copied = rows.map((row) => [...row]);

  for (const merge of merges) {
    const startRow = Number(merge.s?.r);
    const endRow = Number(merge.e?.r);
    const startColumn = Number(merge.s?.c);
    const endColumn = Number(merge.e?.c);

    if (![startRow, endRow, startColumn, endColumn].every(Number.isInteger)) {
      continue;
    }

    const value = copied[startRow]?.[startColumn];
    const text = String(value ?? "").trim();

    if (!text) {
      continue;
    }

    for (let rowIndex = startRow; rowIndex <= endRow; rowIndex += 1) {
      copied[rowIndex] ??= [];
      for (let columnIndex = startColumn; columnIndex <= endColumn; columnIndex += 1) {
        copied[rowIndex][columnIndex] = text;
      }
    }
  }

  return copied;
}

function compactHeaderPart(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function uniqueHeaderParts(parts: string[]) {
  const result: string[] = [];

  for (const part of parts) {
    const text = compactHeaderPart(part);
    if (!text || result[result.length - 1] === text) continue;
    result.push(text);
  }

  return result;
}

function inferHeaderDepth(rows: Array<Array<string | number | boolean | Date | null>>, headerIndex: number) {
  const maxHeaderDepth = Math.min(6, rows.length - headerIndex);

  for (let offset = 1; offset < maxHeaderDepth; offset += 1) {
    const row = rows[headerIndex + offset];

    if (row && isLikelyDataRow(row)) {
      return offset;
    }
  }

  return 1;
}

function headerPathsFromRows(rows: Array<Array<string | number | boolean | Date | null>>, headerIndex: number, headerDepth: number) {
  const headerRows = rows.slice(headerIndex, headerIndex + headerDepth);
  const width = Math.max(...headerRows.map((row) => row.length), 0);

  return Array.from({ length: width }, (_, columnIndex) =>
    uniqueHeaderParts(headerRows.map((row) => compactHeaderPart(row[columnIndex])))
  );
}

function displayHeaderFromPath(path: string[], fallback: string) {
  return path[path.length - 1] || path.find(Boolean) || fallback;
}

export function canonicalUploadHeaders(headers: string[]) {
  const seen = new Map<string, number>();

  return headers.map((header, index) => {
    const inferred = semanticHeaderName(header || `field_${index + 1}`);
    const base = /^[A-Za-z_][A-Za-z0-9_]*$/.test(inferred) ? inferred : `field_${index + 1}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}_${count + 1}`;
  });
}

function inferCsvColumnType(header: string, values: string[]) {
  const normalizedHeader = normalizeHeaderToken(header);

  if (/(^|_)date($|_)|(^|_)time($|_)|created_at|updated_at|timestamp/.test(normalizedHeader) || /日期|时间/.test(header)) {
    return "date";
  }

  if (
    /^(open|high|low|close|adj_close|volume|price|rating|reviews|installs|sentiment_polarity|sentiment_subjectivity)$/.test(normalizedHeader) ||
    /amount|revenue|gmv|sales|score|count|total|rank/.test(normalizedHeader) ||
    /分|排名|数量|总量|率/.test(header)
  ) {
    return "decimal";
  }

  const nonEmptyValues = values.filter((value) => value.trim()).slice(0, 50);

  if (nonEmptyValues.length > 0) {
    const numericCount = nonEmptyValues.filter((value) => Number.isFinite(normalizeCsvNumber(value))).length;

    if (numericCount / nonEmptyValues.length >= 0.8) {
      return "decimal";
    }
  }

  return "text";
}

export function inferTablesFromCsvText(fileName: string, text: string) {
  const tableName = tableNameFromFile(fileName);
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const originalHeaders = lines[0] ? splitCsvLine(lines[0]).filter(Boolean) : [];
  const headers = canonicalUploadHeaders(originalHeaders);
  const rowCount = lines.length > 0 ? lines.length - 1 : 0;

  if (rowCount > MAX_CSV_ROWS) {
    throw new Error(`CSV has too many rows. Maximum supported rows: ${MAX_CSV_ROWS}.`);
  }

  if (headers.length > MAX_CSV_COLUMNS) {
    throw new Error(`CSV has too many columns. Maximum supported columns: ${MAX_CSV_COLUMNS}.`);
  }

  const sampleRows = lines.slice(1, 501).map(splitCsvLine);
  const allRows = lines.slice(1).map(splitCsvLine);
  const sampleRecords = sampleRows.map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""]))
  );

  return [
    {
      name: tableName,
      rowCount,
      rawHeaderRows: [originalHeaders],
      sampleRows: sampleRecords,
      columns: headers.map((header, index) => {
        const values = sampleRows.map((row) => row[index] ?? "");
        const nonNullCount = allRows.reduce((sum, row) => sum + (isPresentCellValue(row[index]) ? 1 : 0), 0);
        const displayName = originalHeaders[index] ?? header;

        return {
          name: header,
          displayName,
          type: inferCsvColumnType(`${originalHeaders[index] ?? ""} ${header}`, values),
          nullable: true,
          rowCount,
          nonNullCount,
          semanticName: header,
          rawHeaderPath: [displayName]
        };
      })
    }
  ];
}

export async function inferTablesFromExcelBuffer(fileName: string, buffer: ArrayBuffer | Uint8Array | Buffer) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });

  return workbook.SheetNames.flatMap((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json<Array<string | number | boolean | Date | null>>(worksheet, {
      header: 1,
      defval: "",
      blankrows: false,
      raw: false,
      dateNF: "yyyy-mm-dd hh:mm:ss"
    });
    const rows = fillMergedHeaderRows(rawRows, worksheet["!merges"] as Array<{ s?: { r?: number; c?: number }; e?: { r?: number; c?: number } }> | undefined);
    const headerIndex = rows.findIndex((row) => row.some((cell) => String(cell ?? "").trim()));

    if (headerIndex < 0) return [];

    const tableName = workbook.SheetNames.length === 1 ? tableNameFromFile(fileName) : tableNameFromFile(sheetName);
    const headerDepth = inferHeaderDepth(rows, headerIndex);
    const headerPaths = headerPathsFromRows(rows, headerIndex, headerDepth).filter((path) => path.length > 0);
    const originalHeaders = headerPaths.map((path, index) => displayHeaderFromPath(path, `field_${index + 1}`));
    const canonicalInputs = headerPaths.map((path, index) => path.join("_") || originalHeaders[index] || `field_${index + 1}`);
    const headers = canonicalUploadHeaders(canonicalInputs);
    const dataRows = rows.slice(headerIndex + headerDepth).filter((row) => row.some((cell) => String(cell ?? "").trim()));

    if (dataRows.length > MAX_EXCEL_ROWS) {
      throw new Error(`Excel sheet has too many rows. Maximum supported rows: ${MAX_EXCEL_ROWS}.`);
    }

    if (headers.length > MAX_EXCEL_COLUMNS) {
      throw new Error(`Excel sheet has too many columns. Maximum supported columns: ${MAX_EXCEL_COLUMNS}.`);
    }

    const sampleRows = dataRows.slice(0, 500);
    const sampleRecords = sampleRows.map((row) =>
      Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""]))
    );

    return [{
      name: tableName,
      rowCount: dataRows.length,
      rawHeaderRows: rows.slice(headerIndex, headerIndex + headerDepth).map((row) => row.map((cell) => compactHeaderPart(cell))),
      sampleRows: sampleRecords,
      columns: headers.map((header, index) => {
        const values = sampleRows.map((row) => String(row[index] ?? ""));
        const nonNullCount = dataRows.reduce((sum, row) => sum + (isPresentCellValue(row[index]) ? 1 : 0), 0);
        const displayName = originalHeaders[index] ?? header;

        return {
          name: header,
          displayName,
          type: inferCsvColumnType(`${displayName} ${header}`, values),
          nullable: true,
          rowCount: dataRows.length,
          nonNullCount,
          semanticName: header,
          rawHeaderPath: headerPaths[index] ?? [displayName]
        };
      })
    }];
  });
}

export async function excelRecordsFromBuffer(fileName: string, buffer: ArrayBuffer | Uint8Array | Buffer) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });

  return workbook.SheetNames.flatMap((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json<Array<string | number | boolean | Date | null>>(worksheet, {
      header: 1,
      defval: "",
      blankrows: false,
      raw: false,
      dateNF: "yyyy-mm-dd hh:mm:ss"
    });
    const rows = fillMergedHeaderRows(rawRows, worksheet["!merges"] as Array<{ s?: { r?: number; c?: number }; e?: { r?: number; c?: number } }> | undefined);
    const headerIndex = rows.findIndex((row) => row.some((cell) => String(cell ?? "").trim()));

    if (headerIndex < 0) return [];

    const headerDepth = inferHeaderDepth(rows, headerIndex);
    const headerPaths = headerPathsFromRows(rows, headerIndex, headerDepth).filter((path) => path.length > 0);
    const originalHeaders = headerPaths.map((path, index) => displayHeaderFromPath(path, `field_${index + 1}`));
    const canonicalInputs = headerPaths.map((path, index) => path.join("_") || originalHeaders[index] || `field_${index + 1}`);
    const headers = canonicalUploadHeaders(canonicalInputs);
    const tableName = workbook.SheetNames.length === 1 ? tableNameFromFile(fileName) : tableNameFromFile(sheetName);
    const dataRows = rows.slice(headerIndex + headerDepth).filter((row) => row.some((cell) => String(cell ?? "").trim()));

    if (dataRows.length > MAX_EXCEL_ROWS) {
      throw new Error(`Excel sheet has too many rows. Maximum supported rows: ${MAX_EXCEL_ROWS}.`);
    }

    if (headers.length > MAX_EXCEL_COLUMNS) {
      throw new Error(`Excel sheet has too many columns. Maximum supported columns: ${MAX_EXCEL_COLUMNS}.`);
    }

    return dataRows.map((row) => ({
      __source_table: tableName,
      ...Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""]))
    }));
  });
}

export async function inferTablesFromUploadFile(file: File) {
  const extension = fileExtension(file.name);

  if (extension === "csv") {
    return inferTablesFromCsvText(file.name, await file.text());
  }

  if (extension === "xls" || extension === "xlsx") {
    return inferTablesFromExcelBuffer(file.name, await file.arrayBuffer());
  }

  return [
    {
      name: tableNameFromFile(file.name),
      columns: []
    }
  ];
}
