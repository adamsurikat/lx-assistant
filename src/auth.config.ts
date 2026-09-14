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
          // Just basic sign-in for the app itself — Google Calendar's
          // read-only scope is requested separately (see the "Connect
          // Google Calendar" flow in Settings) so users aren't forced to
          // grant calendar access just to log in.
          scope: "openid email profile",
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
