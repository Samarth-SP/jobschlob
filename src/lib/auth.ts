import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

const allowedEmails = new Set(
  (process.env.ALLOWED_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean),
);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [GitHub],
  callbacks: {
    signIn({ user }) {
      return !!user.email && allowedEmails.has(user.email.toLowerCase());
    },
  },
});
