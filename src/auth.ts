import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user, account }) {
      if (user) {
        token.userId = user.id;
      } else if (typeof token.userId === "string") {
        // Guard against a session whose user no longer exists in the
        // current database — e.g. the DB was reset/swapped (this bit us
        // when testing different Docker volumes: the JWT session cookie
        // outlives the database, since sessions aren't DB-backed). Without
        // this, every subsequent request would throw Prisma's P2025 from
        // routes that scope queries by session.user.id. Invalidate the
        // token instead so the user is treated as signed out and can log
        // back in cleanly.
        const exists = await prisma.user.findUnique({
          where: { id: token.userId },
          select: { id: true },
        });
        if (!exists) {
          return {};
        }
      }

      // `account` is only present on the initial sign-in request (it comes
      // straight from the OAuth provider callback, not the DB). NextAuth's
      // adapter only calls `linkAccount` the very first time an account is
      // linked — on every subsequent sign-in it just re-establishes a
      // session and does NOT update the stored access/refresh tokens or
      // scope. That means if a user re-consents to grant a new scope (e.g.
      // Google Calendar access) after already having signed in once, the
      // newly issued tokens/scope would otherwise never be persisted. Do it
      // ourselves here so re-consent always takes effect.
      if (account?.provider === "google" && account.providerAccountId) {
        try {
          await prisma.account.update({
            where: {
              provider_providerAccountId: {
                provider: "google",
                providerAccountId: account.providerAccountId,
              },
            },
            data: {
              access_token: account.access_token,
              // Google only sends a refresh_token on first consent (or when
              // prompt=consent forces re-consent) — never clobber a
              // previously stored one with a missing value.
              ...(account.refresh_token ? { refresh_token: account.refresh_token } : {}),
              expires_at: account.expires_at,
              scope: account.scope,
              token_type: account.token_type,
              id_token: account.id_token,
            },
          });
        } catch (err) {
          console.error("Failed to persist refreshed Google account tokens", err);
        }
      }

      return token;
    },
  },
});
