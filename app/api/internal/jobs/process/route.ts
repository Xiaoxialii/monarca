import { NextResponse } from "next/server";
import {
  ASYNC_JOB_TYPES,
  ASYNC_JOB_WORKER_BATCH_SIZE,
  processAsyncJobBatch,
  recoverAsyncJobs,
  type AsyncJobType
} from "@/lib/jobs/async-job-runner";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function workerSecret() {
  return process.env.ASYNC_JOB_WORKER_SECRET || process.env.CRON_SECRET || null;
}

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  if (authorization.toLowerCase().startsWith("bearer ")) {
    return authorization.slice("bearer ".length).trim();
  }
  return request.headers.get("x-worker-secret") ?? request.headers.get("x-cron-secret") ?? null;
}

function unauthorizedResponse() {
  return NextResponse.json(
    { ok: false, code: "UNAUTHORIZED", message: "Internal job worker authentication failed." },
    { status: 401 }
  );
}

function assertAuthorized(request: Request) {
  const expected = workerSecret();
  if (!expected) return false;
  return bearerToken(request) === expected;
}

function jobTypeFromValue(value: unknown): AsyncJobType | null {
  return typeof value === "string" && ASYNC_JOB_TYPES.includes(value as AsyncJobType)
    ? value as AsyncJobType
    : null;
}

async function processInternalJobs(request: Request, input: {
  jobId?: string | null;
  jobType?: AsyncJobType | null;
  limit?: number;
}) {
  if (!assertAuthorized(request)) return unauthorizedResponse();

  const startedAt = Date.now();
  const recovery = await recoverAsyncJobs({
    limit: Math.min(input.limit ?? ASYNC_JOB_WORKER_BATCH_SIZE, ASYNC_JOB_WORKER_BATCH_SIZE)
  }).catch((error) => ({
    ok: false,
    error: error instanceof Error ? error.message : "Async job recovery failed."
  }));

  const worker = await processAsyncJobBatch({
    client: prisma,
    jobId: input.jobId ?? null,
    jobType: input.jobType ?? null,
    limit: input.limit
  });

  return NextResponse.json({
    ok: true,
    recovery,
    claimed: worker.claimed,
    completed: worker.completed,
    failed: worker.failed,
    retried: worker.retried,
    skipped: worker.skipped,
    durationMs: Date.now() - startedAt,
    results: worker.results
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const jobType = jobTypeFromValue(url.searchParams.get("jobType"));
  const limit = Number(url.searchParams.get("limit"));
  return processInternalJobs(request, {
    jobId: url.searchParams.get("jobId"),
    jobType,
    limit: Number.isFinite(limit) && limit > 0 ? limit : undefined
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const record = body && typeof body === "object" && !Array.isArray(body)
    ? body as Record<string, unknown>
    : {};
  return processInternalJobs(request, {
    jobId: typeof record.jobId === "string" ? record.jobId : null,
    jobType: jobTypeFromValue(record.jobType),
    limit: typeof record.limit === "number" && Number.isFinite(record.limit) ? record.limit : undefined
  });
}
