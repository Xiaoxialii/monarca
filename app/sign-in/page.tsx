import { Suspense } from "react";
import { SignInPanel } from "@/components/sign-in-panel";

export default function SignInPage() {
  return (
    <Suspense>
      <SignInPanel />
    </Suspense>
  );
}
