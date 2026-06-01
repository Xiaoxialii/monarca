import { auth } from "@clerk/nextjs/server";
import { TicketPriority, TicketType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const HELP_REQUEST_RECIPIENT =
  process.env.HELP_REQUEST_RECIPIENT_EMAIL || "xiaoxia.li0922@gmail.com";

type HelpRequestInput = {
  source: "checkout" | "support";
  plan?: string;
  type?: string;
  priority?: string;
  name?: string;
  email?: string;
  company?: string;
  workspaceName?: string;
  subject?: string;
  description?: string;
  notes?: string;
  locale?: string;
};

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeTicketType(value: string): TicketType {
  const normalized = value.toLowerCase();

  if (normalized.includes("data") || normalized.includes("数据")) return TicketType.DATA_CONNECTION;
  if (normalized.includes("report") || normalized.includes("报告")) return TicketType.REPORT_GENERATION;
  if (normalized.includes("billing") || normalized.includes("plan") || normalized.includes("付费") || normalized.includes("套餐")) return TicketType.BILLING;
  if (normalized.includes("account") || normalized.includes("账号") || normalized.includes("权限")) return TicketType.ACCOUNT_ACCESS;

  return TicketType.OTHER;
}

function normalizePriority(value: string): TicketPriority {
  const normalized = value.toLowerCase();

  if (normalized.includes("urgent") || normalized.includes("紧急")) return TicketPriority.URGENT;
  if (normalized.includes("high") || normalized.includes("较急")) return TicketPriority.HIGH;

  return TicketPriority.NORMAL;
}

function buildSubject(input: Required<Pick<HelpRequestInput, "source">> & HelpRequestInput) {
  const subject = stringValue(input.subject);

  if (subject) return subject;

  if (input.source === "checkout") {
    const planName = stringValue(input.plan) || "consultation";
    const company = stringValue(input.company);

    return company ? `${planName} request from ${company}` : `${planName} request`;
  }

  return "New support request";
}

function buildDescription(input: HelpRequestInput) {
  const description = stringValue(input.description);
  const notes = stringValue(input.notes);

  if (description) return description;
  if (notes) return notes;

  return "No additional context provided.";
}

async function getOptionalSession() {
  const { userId } = await auth().catch(() => ({ userId: null }));

  if (!userId) return null;

  const user = await prisma.user.findUnique({
    where: { clerkUserId: userId },
    include: {
      memberships: {
        include: { workspace: true },
        orderBy: [{ status: "asc" }, { joinedAt: "asc" }, { createdAt: "asc" }]
      }
    }
  });

  const membership = user?.memberships[0];

  if (!user || !membership) {
    return { user: user ?? null, workspace: null };
  }

  return { user, workspace: membership.workspace };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function sendHelpRequestEmail(input: {
  ticketId: string;
  subject: string;
  description: string;
  context: Record<string, string | null>;
}) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    return { sent: false, reason: "RESEND_API_KEY is not configured" };
  }

  const from = process.env.HELP_REQUEST_FROM_EMAIL || "Monarca AI <onboarding@resend.dev>";
  const rows = Object.entries(input.context)
    .map(([key, value]) => `<tr><td style="padding:4px 10px;color:#64748b">${escapeHtml(key)}</td><td style="padding:4px 10px">${escapeHtml(value || "-")}</td></tr>`)
    .join("");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: HELP_REQUEST_RECIPIENT,
      subject: `[Monarca Help] ${input.subject}`,
      html: `
        <div style="font-family:Arial,sans-serif;color:#0f172a">
          <h2>New help request</h2>
          <p><strong>Ticket ID:</strong> ${escapeHtml(input.ticketId)}</p>
          <table style="border-collapse:collapse">${rows}</table>
          <h3>Message</h3>
          <p style="white-space:pre-wrap">${escapeHtml(input.description)}</p>
        </div>
      `
    })
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    return { sent: false, reason: errorText || `Resend responded with ${response.status}` };
  }

  return { sent: true, reason: null };
}

export async function createHelpRequest(rawInput: HelpRequestInput) {
  const input = {
    ...rawInput,
    source: rawInput.source || "support"
  };
  const session = await getOptionalSession();
  const subject = buildSubject(input);
  const description = buildDescription(input);
  const plan = stringValue(input.plan);
  const name = stringValue(input.name);
  const email = stringValue(input.email).toLowerCase();
  const company = stringValue(input.company);
  const workspaceName = stringValue(input.workspaceName);
  const source = input.source;
  const type = normalizeTicketType(stringValue(input.type) || plan || source);
  const priority = normalizePriority(stringValue(input.priority));
  const context = {
    source,
    plan: plan || null,
    name: name || null,
    email: email || null,
    company: company || null,
    workspaceName: workspaceName || session?.workspace?.name || null,
    locale: stringValue(input.locale) || null,
    recipient: HELP_REQUEST_RECIPIENT
  };

  const ticket = await prisma.supportTicket.create({
    data: {
      workspaceId: session?.workspace?.id,
      submitterId: session?.user?.id,
      type,
      priority,
      subject,
      description,
      contextJson: {
        ...context,
        rawRequest: {
          source,
          plan,
          name,
          email,
          company,
          workspaceName,
          notes: stringValue(input.notes),
          description: stringValue(input.description)
        }
      }
    },
    select: {
      id: true,
      subject: true,
      createdAt: true
    }
  });

  const emailResult = await sendHelpRequestEmail({
    ticketId: ticket.id,
    subject,
    description,
    context
  }).catch((error) => ({
    sent: false,
    reason: error instanceof Error ? error.message : "Unknown email error"
  }));

  await prisma.supportTicket.update({
    where: { id: ticket.id },
    data: {
      contextJson: {
        ...context,
        emailNotification: {
          recipient: HELP_REQUEST_RECIPIENT,
          sent: emailResult.sent,
          reason: emailResult.reason
        },
        rawRequest: {
          source,
          plan,
          name,
          email,
          company,
          workspaceName,
          notes: stringValue(input.notes),
          description: stringValue(input.description)
        }
      }
    }
  });

  return {
    ticket,
    recipient: HELP_REQUEST_RECIPIENT,
    emailSent: emailResult.sent
  };
}
