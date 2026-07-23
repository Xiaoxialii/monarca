import dotenv from "dotenv";
import { register } from "node:module";
import { PrismaClient, WorkspaceMemberStatus } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

register("./ts-path-loader.mjs", import.meta.url);

dotenv.config({ path: ".env.local" });
dotenv.config();

const { generateEcommerceDecisionSnapshots } = await import("../lib/dashboard/decision-snapshot-generator.ts");

const args = new Map();
for (const arg of process.argv.slice(2)) {
  const [key, ...rest] = arg.replace(/^--/, "").split("=");
  args.set(key, rest.join("=") || "true");
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not configured.");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
  log: ["error"]
});

async function workspaceIdFromEmail(email) {
  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    include: {
      memberships: {
        include: { workspace: true },
        orderBy: [
          { status: "asc" },
          { joinedAt: "asc" },
          { createdAt: "asc" }
        ]
      }
    }
  });

  const membership = user?.memberships.find((row) => row.status === WorkspaceMemberStatus.ACTIVE)
    ?? user?.memberships[0]
    ?? null;

  return membership?.workspaceId ?? null;
}

async function main() {
  const email = args.get("email");
  const explicitWorkspaceId = args.get("workspaceId");
  const workspaceId = explicitWorkspaceId || (email ? await workspaceIdFromEmail(email) : null);

  if (!workspaceId) {
    throw new Error("Usage: node scripts/regenerate-decision-snapshots.mjs --workspaceId=... or --email=user@example.com [--mode=full|sku|all]");
  }
  const mode = args.get("mode") || "all";
  const modes = mode === "full"
    ? ["full"]
    : mode === "sku"
      ? ["sku"]
      : ["full", "sku"];

  const startedAt = Date.now();
  const result = await generateEcommerceDecisionSnapshots(prisma, {
    workspaceId,
    dataSourceId: null,
    sourceJobId: null,
    modes
  });

  console.log(JSON.stringify({
    ok: true,
    workspaceId,
    durationMs: Date.now() - startedAt,
    ...result
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
