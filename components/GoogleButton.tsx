"use client";
import { signIn } from "next-auth/react";

export default function GoogleButton({ callbackUrl }: { callbackUrl: string }) {
  return (
    <button className="btn-primary w-full" onClick={() => signIn("google", { callbackUrl })}>
      Masuk dengan Google
    </button>
  );
}
