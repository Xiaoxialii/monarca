import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

dotenv.config({ path: ".env.local" });
dotenv.config();

const args = new Map();
for (const arg of process.argv.slice(2)) {
  const [key, ...rest] = arg.replace(/^--/, "").split("=");
  args.set(key, rest.join("=") || "true");
}

const email = String(args.get("email") || "").trim().toLowerCase();
const userId = String(args.get("userId") || "").trim();
const actorEmail = String(args.get("actorEmail") || "").trim().toLowerCase();
const actorUserId = String(args.get("actorUserId") || "").trim();
const enabledArg = args.get("enabled");
const apply = args.get("apply") === "true";

if (!email && !userId) {
  throw new Error("Pass --email=user@example.com or --userId=user_id.");
}

if (enabledArg !== "true" && enabledArg !== "false") {
  throw new Error("Pass --enabled=true or --enabled=false.");
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not configured.");

const nextValue = enabledArg === "true";
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
  log: ["error"]
});

async function findUserByIdOrEmail(inputUserId, inputEmail) {
  if (inputUserId) {
    return prisma.user.findUnique({
      where: { id: inputUserId },
      select: { id: true, email: true, productAccessEnabled: true }
    });
  }

  return prisma.user.findUnique({
    where: { email: inputEmail },
    select: { id: true, email: true, productAccessEnabled: true }
  });
}

async function main() {
  const target = await findUserByIdOrEmail(userId, email);
  if (!target) {
    throw new Error(`Target user not found: ${userId || email}`);
  }

  const actor = actorUserId || actorEmail
    ? await findUserByIdOrEmail(actorUserId, actorEmail)
    : null;

  const eventType = nextValue ? "USER_PRODUCT_ACCESS_ENABLED" : "USER_PRODUCT_ACCESS_DISABLED";
  const summary = {
    dryRun: !apply,
    eventType,
    targetUserId: target.id,
    targetEmail: target.email,
    actorUserId: actor?.id ?? null,
    previousValue: target.productAccessEnabled,
    newValue: nextValue
  };

  if (!apply) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: target.id },
      data: { productAccessEnabled: nextValue }
    });

    await tx.userProductAccessAudit.create({
      data: {
        actorUserId: actor?.id ?? null,
        targetUserId: target.id,
        previousValue: target.productAccessEnabled,
        newValue: nextValue,
        eventType
      }
    });
  });

  console.log(JSON.stringify({ ...summary, applied: true }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
