import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { WorkspaceAuthError } from "@/lib/workspace-auth-error";

export const PRODUCT_ACCESS_REQUIRED_CODE = "PRODUCT_ACCESS_REQUIRED";
export const PRODUCT_ACCESS_REQUIRED_MESSAGE =
  "Your Monarca account has not been approved for product access.";

type ProductAccessUser = {
  id: string;
  productAccessEnabled?: boolean | null;
};

export async function hasProductAccess(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { productAccessEnabled: true }
  });

  return user?.productAccessEnabled === true;
}

export async function assertProductAccessForUser(user: ProductAccessUser) {
  if (user.productAccessEnabled === true) {
    return;
  }

  const enabled = await hasProductAccess(user.id);

  if (!enabled) {
    throw new WorkspaceAuthError(PRODUCT_ACCESS_REQUIRED_MESSAGE, 403, PRODUCT_ACCESS_REQUIRED_CODE);
  }
}

export async function getCurrentProductAccessUser() {
  const { userId } = await auth();

  if (!userId) return null;

  return prisma.user.findUnique({
    where: { clerkUserId: userId },
    select: {
      id: true,
      clerkUserId: true,
      email: true,
      name: true,
      productAccessEnabled: true
    }
  });
}

export async function requireCurrentProductAccess() {
  const user = await getCurrentProductAccessUser();

  if (!user) {
    throw new WorkspaceAuthError("Unauthorized", 401);
  }

  await assertProductAccessForUser(user);

  return user;
}

export async function assertProductAccessForUserId(userId: string | null | undefined) {
  if (!userId) {
    throw new WorkspaceAuthError(PRODUCT_ACCESS_REQUIRED_MESSAGE, 403, PRODUCT_ACCESS_REQUIRED_CODE);
  }

  const enabled = await hasProductAccess(userId);

  if (!enabled) {
    throw new WorkspaceAuthError(PRODUCT_ACCESS_REQUIRED_MESSAGE, 403, PRODUCT_ACCESS_REQUIRED_CODE);
  }
}

export function productAccessErrorPayload() {
  return {
    error: {
      code: PRODUCT_ACCESS_REQUIRED_CODE,
      message: PRODUCT_ACCESS_REQUIRED_MESSAGE
    }
  };
}
