import dotenv from "dotenv";
import { PrismaClient, SystemRole } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

dotenv.config({ path: ".env.local" });
dotenv.config();

const args = new Map();
for (const arg of process.argv.slice(2)) {
  const [key, ...rest] = arg.replace(/^--/, "").split("=");
  args.set(key, rest.join("=") || "true");
}

function emailList(value) {
  return String(value || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

const emails = emailList(args.get("email") || process.env.SUPER_ADMIN_EMAILS);
const apply = args.get("apply") === "true";

if (!emails.length) {
  throw new Error("Pass --email=user@example.com or set SUPER_ADMIN_EMAILS=user@example.com.");
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not configured.");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
  log: ["error"]
});

async function main() {
  const results = [];

  for (const email of emails) {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, systemRole: true }
    });

    if (!user) {
      results.push({
        email,
        found: false,
        userId: null,
        previousRole: null,
        newRole: null,
        applied: false,
        message: "User not found. Have the user complete normal registration, then rerun this script."
      });
      continue;
    }

    if (!apply || user.systemRole === SystemRole.SUPER_ADMIN) {
      results.push({
        email: user.email,
        found: true,
        userId: user.id,
        previousRole: user.systemRole,
        newRole: user.systemRole === SystemRole.SUPER_ADMIN ? SystemRole.SUPER_ADMIN : SystemRole.SUPER_ADMIN,
        applied: false,
        message: apply ? "Already SUPER_ADMIN." : "Dry run. Rerun with --apply=true to update."
      });
      continue;
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { systemRole: SystemRole.SUPER_ADMIN },
      select: { id: true, email: true, systemRole: true }
    });

    results.push({
      email: updated.email,
      found: true,
      userId: updated.id,
      previousRole: user.systemRole,
      newRole: updated.systemRole,
      applied: true,
      message: "Updated. User should sign out and sign in again, or refresh any active session-backed pages."
    });
  }

  console.log(JSON.stringify({ dryRun: !apply, results }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
