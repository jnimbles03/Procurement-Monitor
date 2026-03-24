import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { pool } from "@workspace/db";

const PgStore = connectPg(session);

export const sessionMiddleware = session({
  store: new PgStore({
    pool,
    createTableIfMissing: true,
  }),
  secret: process.env.SESSION_SECRET ?? "dev-secret-change-in-production",
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 7,
    sameSite: process.env.NODE_ENV === "production" ? "lax" : "lax",
  },
});

const ALLOWED_DOMAIN = "docusign.com";

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user: Express.User, done) => {
  done(null, user);
});

const callbackURL =
  process.env.GOOGLE_CALLBACK_URL ??
  `https://${process.env.REPLIT_DEV_DOMAIN}/api/auth/google/callback`;

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL,
        scope: ["profile", "email"],
      },
      (_accessToken, _refreshToken, profile, done) => {
        const email = profile.emails?.[0]?.value ?? "";
        if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) {
          return done(null, false, {
            message: `Access restricted to @${ALLOWED_DOMAIN} accounts`,
          });
        }
        const user: Express.User = {
          id: profile.id,
          email,
          name: profile.displayName,
          photo: profile.photos?.[0]?.value,
        };
        return done(null, user);
      },
    ),
  );
}

export { passport };
