import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

/**
 * Edge-safe NextAuth config (no Prisma adapter, no Node-only imports).
 * Used directly by middleware. The full config in auth.ts extends this
 * with the Prisma adapter for use in API routes / server components.
 */
export const authConfig: NextAuthConfig = {
  providers: [
    Google({
      authorization: {
        params: {
          // Request offline access + a refresh token (needed since we call
          // the Calendar API from the backend, outside the login flow), and
          // the read-only Calendar scope to show the user's meetings.
          access_type: "offline",
          prompt: "consent",
          scope:
            "openid email profile https://www.googleapis.com/auth/calendar.readonly",
        },
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    authorized({ auth: session }) {
      return !!session?.user;
    },
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && typeof token.userId === "string") {
        session.user.id = token.userId;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
};
