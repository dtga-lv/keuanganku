import { withAuth } from "next-auth/middleware";

export default withAuth({ pages: { signIn: "/login" } });

// API route memeriksa sesi sendiri (balas JSON 401), jadi dikecualikan di sini.
export const config = { matcher: ["/((?!api|login|_next|icons|manifest.webmanifest|sw.js|favicon.ico).*)"] };
