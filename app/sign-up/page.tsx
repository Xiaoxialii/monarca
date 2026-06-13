import { Suspense } from "react";
import { SignUpPanel } from "@/components/sign-up-panel";

export default function SignUpPage() {
  return (
    <Suspense>
      <SignUpPanel />
    </Suspense>
  );
}
