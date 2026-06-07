import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { createPaymentOrderForUser, findPlanForCheckout } from "@/lib/billing/checkout-orders";
import { prisma } from "@/lib/prisma";
import {
  isStripeCheckoutCurrency,
  isStripeCheckoutPlan,
  stripeCheckoutPlans
} from "@/lib/stripe/checkout-plans";
import { getStripe } from "@/lib/stripe/server";
import { syncCurrentClerkUser } from "@/lib/clerk-user-sync";

export const dynamic = "force-dynamic";

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function appUrl(request: Request) {
  const requestOrigin = new URL(request.url).origin;

  // Stripe should return users to the same host that started checkout.
  // A configured custom domain can be stale before DNS is ready, so it must not
  // override localhost, preview URLs, or the active production domain.
  if (requestOrigin.startsWith("http://") || requestOrigin.startsWith("https://")) {
    return requestOrigin;
  }

  const configuredUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL;

  if (!configuredUrl) return requestOrigin;

  return configuredUrl.startsWith("http") ? configuredUrl : `https://${configuredUrl}`;
}

type CheckoutPayload = Record<string, unknown>;

function checkoutErrorMessage(error: unknown) {
  if (error instanceof Error) {
    if (
      error.message.includes("datasource.url") ||
      error.message.includes("must start with the protocol `postgresql://`") ||
      error.message.includes("DATABASE_URL must be a PostgreSQL connection string") ||
      error.message.includes("Can't reach database server")
    ) {
      return "数据库连接未配置正确。当前项目需要 PostgreSQL，请把 DATABASE_URL 配置成 postgresql:// 或 postgres:// 后重试。";
    }

    if (error.message.includes("STRIPE_SECRET_KEY")) {
      return "Stripe 密钥未配置：请在环境变量中设置 STRIPE_SECRET_KEY。";
    }

    if (error.message === "SIGNED_IN_USER_EMAIL_REQUIRED") {
      return "当前账号没有邮箱。你可以填写工作邮箱后再付款，或先在账号中绑定邮箱。";
    }

    if (error.message.includes("No such price")) {
      return "Stripe Price ID 不存在，请检查当前币种对应的 price_... 是否来自同一个 Stripe 测试账号。";
    }

    if (error.message.includes("livemode")) {
      return "Stripe 测试/正式环境不一致，请确认 Secret Key 和 Price ID 都来自同一个环境。";
    }

    if (error.message.includes("Selected plan is not available")) {
      return "当前套餐暂不可购买，请稍后刷新后重试。";
    }

    if (
      error.message.includes("PaymentOrder") ||
      error.message.includes("WorkspaceUsageAllowance") ||
      error.message.includes("WorkspaceSubscription") ||
      error.message.includes("Plan")
    ) {
      return "付款权限表尚未初始化，请先执行数据库迁移后重试。";
    }
  }

  return "付款初始化失败，请检查登录状态和 Stripe 配置后重试。";
}

async function getCheckoutUser(fallbackEmail: string) {
  const { userId } = await auth();

  if (!userId) return null;

  try {
    const userSession = await syncCurrentClerkUser({ fallbackEmail });

    if (userSession) {
      return {
        appUserId: userSession.user.id,
        clerkUserId: userSession.user.clerkUserId,
        email: userSession.user.email,
        workspace: userSession.workspace
      };
    }
  } catch (error) {
    console.warn("Skipping local user sync before Stripe checkout", error);
  }

  try {
    const client = await clerkClient();
    const clerkUser = await client.users.getUser(userId);
    const email =
      clerkUser.emailAddresses.find((item) => item.id === clerkUser.primaryEmailAddressId)
        ?.emailAddress ??
      clerkUser.emailAddresses[0]?.emailAddress ??
      fallbackEmail;

    return {
      appUserId: null,
      clerkUserId: userId,
      email
    };
  } catch (error) {
    console.warn("Unable to load Clerk user before Stripe checkout", error);

    return {
      appUserId: null,
      clerkUserId: userId,
      email: fallbackEmail
    };
  }
}

async function createCheckoutSession(request: Request, payload: CheckoutPayload) {
  const plan = stringValue(payload.plan);

  if (!isStripeCheckoutPlan(plan)) {
    return {
      ok: false as const,
      status: 400,
      message: "当前套餐暂未接入在线付款，请选择单次体验、数据库搭建或专业版。"
    };
  }

  const planConfig = stripeCheckoutPlans[plan];
  const requestedCurrency = stringValue(payload.currency).toLowerCase();
  const currency = isStripeCheckoutCurrency(requestedCurrency) ? requestedCurrency : "cny";
  const priceEnv =
    typeof planConfig.priceEnv === "string" ? planConfig.priceEnv : planConfig.priceEnv[currency];
  const priceId = process.env[priceEnv];

  if (!priceId) {
    return {
      ok: false as const,
      status: 500,
      message: `Stripe 价格未配置：请在环境变量中设置 ${priceEnv}。`
    };
  }

  const baseUrl = appUrl(request);
  const email = stringValue(payload.email).toLowerCase();
  const name = stringValue(payload.name);
  const company = stringValue(payload.company || payload.organization);
  const notes = stringValue(payload.notes);

  try {
    const checkoutUser = await getCheckoutUser(email);

    if (!checkoutUser) {
      return {
        ok: false as const,
        status: 401,
        message: "请先登录后再购买套餐。"
      };
    }

    let entitlementPlan: Awaited<ReturnType<typeof findPlanForCheckout>> | null = null;
    let paymentOrder: Awaited<ReturnType<typeof createPaymentOrderForUser>> | null = null;

    try {
      entitlementPlan = await findPlanForCheckout(plan);

      if (checkoutUser.appUserId) {
        const workspaceId = "workspace" in checkoutUser ? checkoutUser.workspace?.id : undefined;

        paymentOrder = await createPaymentOrderForUser({
          userId: checkoutUser.appUserId,
          workspaceId,
          plan: entitlementPlan
        });
      }
    } catch (error) {
      console.warn("Continuing Stripe checkout without a local payment order", error);
    }

    const metadata: Record<string, string> = {
      plan,
      currency,
      clerkUserId: checkoutUser.clerkUserId,
      name,
      company,
      notes
    };

    if (checkoutUser.appUserId) metadata.appUserId = checkoutUser.appUserId;
    if ("workspace" in checkoutUser && checkoutUser.workspace?.id) metadata.workspaceId = checkoutUser.workspace.id;
    if (paymentOrder) metadata.paymentOrderId = paymentOrder.id;

    if (entitlementPlan) {
      metadata.entitlementPlanId = entitlementPlan.id;
      metadata.entitlementPlanCode = entitlementPlan.code;
    }

    const stripe = getStripe();
    const stripeSession = await stripe.checkout.sessions.create({
      mode: planConfig.mode,
      line_items: [
        {
          price: priceId,
          quantity: 1
        }
      ],
      customer_email: email || checkoutUser.email || undefined,
      client_reference_id: checkoutUser.clerkUserId,
      success_url: `${baseUrl}/checkout/success?plan=${plan}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/checkout/${plan}?checkout=cancelled`,
      metadata,
      subscription_data:
        planConfig.mode === "subscription"
          ? {
              metadata
            }
          : undefined
    });

    if (!stripeSession.url) {
      return {
        ok: false as const,
        status: 500,
        message: "Stripe Checkout 创建失败，请稍后重试。"
      };
    }

    if (paymentOrder) {
      await prisma.paymentOrder.update({
        where: { id: paymentOrder.id },
        data: { providerSessionId: stripeSession.id }
      });
    }

    return { ok: true as const, url: stripeSession.url };
  } catch (error) {
    console.error("Stripe checkout failed", error);

    return {
      ok: false as const,
      status: 500,
      message: checkoutErrorMessage(error)
    };
  }
}

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const payload = Object.fromEntries(searchParams.entries());
  const result = await createCheckoutSession(request, payload);

  if (!result.ok) {
    const fallbackPlan = isStripeCheckoutPlan(stringValue(payload.plan))
      ? stringValue(payload.plan)
      : "professional";
    const fallbackUrl = new URL(`/checkout/${fallbackPlan}`, request.url);
    fallbackUrl.searchParams.set("checkout", "error");
    fallbackUrl.searchParams.set("message", result.message);

    return NextResponse.redirect(fallbackUrl);
  }

  return NextResponse.redirect(result.url);
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const result = await createCheckoutSession(request, payload || {});

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        message: result.message
      },
      { status: result.status }
    );
  }

  return NextResponse.json({ ok: true, url: result.url });
}
