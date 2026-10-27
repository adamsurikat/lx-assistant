import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/auth.config";
import { authenticateUser, AuthInputError } from "@/lib/localAuth";

class RateLimited extends CredentialsSignin { code = "rate_limited"; }

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [Credentials({
    credentials: { email: { type: "email" }, password: { type: "password" } },
    async authorize(credentials) {
      try { return await authenticateUser(credentials.email, credentials.password); }
      catch (error) {
        if (error instanceof AuthInputError && error.status === 429) throw new RateLimited();
        throw error;
      }
    },
  })],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      const userId = user?.id ?? token.userId;
      if (typeof userId !== "string") return null;
      const current = await prisma.user.findUnique({ where: { id: userId }, select: { sessionVersion: true, email: true, isAdmin: true } });
      if (!current || (!user && (token.sessionVersion ?? 0) !== current.sessionVersion)) return null;
      token.userId = userId;
      token.sessionVersion = current.sessionVersion;
      token.email = current.email;
      token.isAdmin = current.isAdmin;
      return token;
    },
  },
});
