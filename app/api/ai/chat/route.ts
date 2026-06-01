import { NextResponse } from "next/server";
import { UsageActionType } from "@prisma/client";
import { requireWorkspace, workspaceAuthErrorResponse } from "@/lib/workspace-auth";
import { checkUserEntitlement, consumeCredit, EntitlementError } from "@/lib/entitlements";

export const dynamic = "force-dynamic";

const MAX_CHAT_INPUT_CHARS = 12_000;
const MAX_OUTPUT_TOKENS = 700;

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

function normalizeMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .flatMap((message) => {
      if (!message || typeof message !== "object" || Array.isArray(message)) {
        return [];
      }

      const record = message as Record<string, unknown>;
      const role = record.role === "assistant" ? "assistant" : record.role === "user" ? "user" : null;
      const content = typeof record.content === "string" ? record.content.trim() : "";

      if (!role || !content) {
        return [];
      }

      return [{ role, content: content.slice(0, 4000) } satisfies ChatMessage];
    })
    .slice(-10);
}

function extractOutputText(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const record = payload as Record<string, unknown>;

  if (typeof record.output_text === "string") {
    return record.output_text.trim();
  }

  const output = Array.isArray(record.output) ? record.output : [];

  return output
    .flatMap((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return [];
      }

      const content = (item as Record<string, unknown>).content;

      if (!Array.isArray(content)) {
        return [];
      }

      return content.flatMap((part) => {
        if (!part || typeof part !== "object" || Array.isArray(part)) {
          return [];
        }

        const text = (part as Record<string, unknown>).text;
        return typeof text === "string" ? [text] : [];
      });
    })
    .join("\n")
    .trim();
}

function estimateTokens(text: string) {
  return Math.max(1, Math.ceil(text.length / 4));
}

export async function POST(request: Request) {
  try {
    const session = await requireWorkspace();
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { ok: false, message: "OPENAI_API_KEY is not configured on the server" },
        { status: 500 }
      );
    }

    const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const messages = normalizeMessages(payload?.messages);

    if (messages.length === 0 || messages[messages.length - 1]?.role !== "user") {
      return NextResponse.json({ ok: false, message: "Send at least one user message" }, { status: 400 });
    }

    const inputText = messages.map((message) => message.content).join("\n");

    if (inputText.length > MAX_CHAT_INPUT_CHARS) {
      return NextResponse.json(
        { ok: false, message: "Message is too long. Please shorten it and try again." },
        { status: 413 }
      );
    }

    const estimatedMaxTokens = estimateTokens(inputText) + MAX_OUTPUT_TOKENS;
    const entitlement = await checkUserEntitlement(session.user.id, UsageActionType.AI_FOLLOW_UP);

    if (Number.isFinite(entitlement.remaining) && entitlement.remaining < estimatedMaxTokens) {
      throw new EntitlementError("CREDIT_USED_UP", "AI 使用额度不足，请升级套餐或购买新额度。");
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
        instructions: [
          "You are Monarca AI, an analytics SaaS assistant embedded in the user's dashboard.",
          "Help with business metrics, data sources, reports, dashboard setup, and growth analysis.",
          "Be concise, practical, and avoid inventing access to private data that was not provided."
        ].join(" "),
        input: messages.map((message) => ({
          role: message.role,
          content: message.content
        })),
        max_output_tokens: MAX_OUTPUT_TOKENS,
        user: session.user.clerkUserId
      })
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const errorMessage =
        data && typeof data === "object" && !Array.isArray(data)
          ? ((data as Record<string, { message?: unknown }>).error?.message as string | undefined)
          : null;

      return NextResponse.json(
        { ok: false, message: errorMessage ?? "OpenAI request failed" },
        { status: response.status }
      );
    }

    const reply = extractOutputText(data);
    const consumed = await consumeCredit({
      userId: session.user.id,
      actionType: UsageActionType.AI_FOLLOW_UP,
      amount: estimateTokens(`${inputText}\n${reply}`),
      metadata: {
        workspaceId: session.workspace.id,
        model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini"
      }
    });

    return NextResponse.json({
      ok: true,
      reply: reply || "I could not generate a reply. Please try again.",
      entitlement: {
        creditId: consumed.creditId,
        remainingAiTokens: consumed.remaining
      }
    });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);

    if (authResponse) {
      return authResponse;
    }

    if (error instanceof EntitlementError) {
      return NextResponse.json(
        {
          ok: false,
          code: error.code,
          message: error.message,
          upgradeUrl: "/checkout/professional",
          oneTimeUrl: "/checkout/trial"
        },
        { status: error.status }
      );
    }

    return NextResponse.json({ ok: false, message: "Failed to call ChatGPT" }, { status: 500 });
  }
}
