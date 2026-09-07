import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Uses the Edge-safe config (no Prisma) so this can run in the Edge runtime.
// Full session/user data (Jira tokens etc.) is only read in Node.js API
// routes and server components via src/auth.ts.
const { auth } = NextAuth(authConfig);

export default auth;

export const config = {
  matcher: ["/((?!api/auth|login|_next/static|_next/image|favicon.ico).*)"],
};
