import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Pembungkus route handler: error -> JSON berbahasa Indonesia. */
export function route<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
      if (e instanceof ZodError) {
        const msg = e.issues.map((i) => `${i.path.join(".")} ${i.message}`).join(", ");
        return NextResponse.json({ error: `Data tidak valid: ${msg}` }, { status: 400 });
      }
      console.error(e);
      return NextResponse.json({ error: "Terjadi kesalahan di server" }, { status: 500 });
    }
  };
}
