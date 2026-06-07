const MAX_CSV_ROWS = 300_000;
const MAX_CSV_COLUMNS = 60;

export function fileExtension(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

export function tableNameFromFile(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_]+/g, "_") || "uploaded_file";
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

function inferCsvColumnType(header: string, values: string[]) {
  const normalizedHeader = header.toLowerCase().replace(/[^a-z0-9]+/g, "_");

  if (/date|time|created_at|updated_at|timestamp/.test(normalizedHeader)) {
    return "date";
  }

  if (
    /^(open|high|low|close|adj_close|volume|price|rating|reviews|installs|sentiment_polarity|sentiment_subjectivity)$/.test(normalizedHeader) ||
    /amount|revenue|gmv|sales|score|count|total/.test(normalizedHeader)
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
  const headers = lines[0] ? splitCsvLine(lines[0]).filter(Boolean) : [];
  const rowCount = lines.length > 0 ? lines.length - 1 : 0;

  if (rowCount > MAX_CSV_ROWS) {
    throw new Error(`CSV has too many rows. Maximum supported rows: ${MAX_CSV_ROWS}.`);
  }

  if (headers.length > MAX_CSV_COLUMNS) {
    throw new Error(`CSV has too many columns. Maximum supported columns: ${MAX_CSV_COLUMNS}.`);
  }

  const sampleRows = lines.slice(1, 501).map(splitCsvLine);
  const sampleRecords = sampleRows.map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""]))
  );

  return [
    {
      name: tableName,
      rowCount,
      sampleRows: sampleRecords,
      columns: headers.map((header, index) => {
        const values = sampleRows.map((row) => row[index] ?? "");

        return {
          name: header,
          type: inferCsvColumnType(header, values),
          nullable: true
        };
      })
    }
  ];
}

export async function inferTablesFromUploadFile(file: File) {
  const extension = fileExtension(file.name);

  if (extension === "csv") {
    return inferTablesFromCsvText(file.name, await file.text());
  }

  return [
    {
      name: tableNameFromFile(file.name),
      columns: []
    }
  ];
}
