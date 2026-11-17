"use client";

import { SignIn } from "@clerk/react";
import { SIGN_IN_PATH, SIGN_UP_PATH } from "@/lib/auth";

export default function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 py-10">
      <SignIn routing="path" path={SIGN_IN_PATH} signUpUrl={SIGN_UP_PATH} />
    </div>
  );
}
