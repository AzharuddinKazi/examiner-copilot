"use client";

import { SignUp } from "@clerk/react";
import { SIGN_IN_PATH, SIGN_UP_PATH } from "@/lib/auth";

export default function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 py-10">
      <SignUp routing="path" path={SIGN_UP_PATH} signInUrl={SIGN_IN_PATH} />
    </div>
  );
}
