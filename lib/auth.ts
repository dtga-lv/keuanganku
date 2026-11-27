import { getServerSession, type NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { q } from "./db";
import { encrypt } from "./crypto";
import { HttpError } from "./http";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 },
  pages: { signIn: "/login" },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          // spreadsheets = baca/tulis Google Sheet. access_type=offline + prompt=consent
          // memastikan Google mengirim refresh_token agar server bisa sinkron di belakang layar.
          scope: "openid email profile https://www.googleapis.com/auth/spreadsheets",
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ account, profile }) {
      if (!account || !profile?.email) return false;
      const enc = account.refresh_token ? encrypt(account.refresh_token) : null;
      const picture = (profile as { picture?: string }).picture ?? null;
      await q(
        `insert into users (google_sub, email, name, avatar_url, google_refresh_token_enc)
         values ($1,$2,$3,$4,$5)
         on conflict (google_sub) do update set
           email = excluded.email, name = excluded.name, avatar_url = excluded.avatar_url,
           google_refresh_token_enc = coalesce(excluded.google_refresh_token_enc, users.google_refresh_token_enc)`,
        [account.providerAccountId, profile.email, profile.name ?? null, picture, enc]
      );
      return true;
    },
    async jwt({ token, account }) {
      if (account) {
        const [u] = await q<{ id: string }>(`select id from users where google_sub = $1`, [account.providerAccountId]);
        token.uid = u?.id;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.uid as string;
      return session;
    },
  },
};

export async function requireUser() {
  const s = await getServerSession(authOptions);
  if (!s?.user?.id) throw new HttpError(401, "Silakan masuk terlebih dahulu");
  return { id: s.user.id, email: s.user.email ?? "", name: s.user.name ?? s.user.email ?? "Pengguna" };
}
