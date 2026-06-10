import assert from "node:assert/strict";
import test from "node:test";
import jitiFactory from "jiti";

const jiti = jitiFactory(process.cwd() + "/");
const {
  dateRangeCacheKey,
  filterRowsByPreviousReportDateRange,
  filterRowsByReportDateRange,
  findBusinessDateColumn,
  resolveReportDateRange
} = jiti("./lib/report-date-range.ts");

const columns = [
  { name: "id", type: "string" },
  { name: "created_at", type: "timestamp" },
  { name: "order_date", type: "date" }
];

const rows = [
  { id: "old", order_date: "2026-05-01", amount: 10 },
  { id: "previous", order_date: "2026-05-25", amount: 20 },
  { id: "current-a", order_date: "2026-06-01", amount: 30 },
  { id: "current-b", order_date: "2026-06-07", amount: 40 }
];

test("business date field prefers order_date over created_at", () => {
  assert.equal(findBusinessDateColumn(columns)?.name, "order_date");
});

test("7D range filters rows to the current period only", () => {
  const range = resolveReportDateRange({ preset: "7D" }, new Date("2026-06-07T12:00:00.000Z"));
  const filtered = filterRowsByReportDateRange(rows, "order_date", range);

  assert.deepEqual(filtered.map((row) => row.id), ["current-a", "current-b"]);
});

test("TODAY range resolves to the current business day only", () => {
  const range = resolveReportDateRange({ preset: "TODAY" }, new Date("2026-06-07T12:00:00.000Z"));

  assert.equal(range.preset, "TODAY");
  assert.equal(range.startDate, "2026-06-07");
  assert.equal(range.endDate, "2026-06-07");
});

test("previous period uses the same duration immediately before current", () => {
  const range = resolveReportDateRange({ preset: "7D" }, new Date("2026-06-07T12:00:00.000Z"));
  const previous = filterRowsByPreviousReportDateRange(rows, "order_date", range);

  assert.deepEqual(previous.map((row) => row.id), ["previous"]);
});

test("ALL range keeps all rows", () => {
  const range = resolveReportDateRange({ preset: "ALL" }, new Date("2026-06-07T12:00:00.000Z"));

  assert.equal(filterRowsByReportDateRange(rows, "order_date", range).length, rows.length);
});

test("missing time field does not fake a selected range", () => {
  const range = resolveReportDateRange({ preset: "30D" }, new Date("2026-06-07T12:00:00.000Z"));

  assert.deepEqual(filterRowsByReportDateRange(rows, null, range), rows);
});

test("cache key includes date range and date field", () => {
  const sevenDays = resolveReportDateRange({ preset: "7D" }, new Date("2026-06-07T12:00:00.000Z"));
  const thirtyDays = resolveReportDateRange({ preset: "30D" }, new Date("2026-06-07T12:00:00.000Z"));

  assert.notEqual(dateRangeCacheKey(sevenDays, "order_date"), dateRangeCacheKey(thirtyDays, "order_date"));
  assert.match(dateRangeCacheKey(sevenDays, "order_date"), /order_date/);
});
