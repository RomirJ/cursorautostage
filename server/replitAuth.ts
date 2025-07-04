import * as client from "openid-client";
import { Strategy, Issuer, generators, TokenSet } from "openid-client";

import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";

if (!process.env.REPLIT_DOMAINS) {
  throw new Error("Environment variable REPLIT_DOMAINS not provided");
}

// Add custom domain support
const domains = process.env.REPLIT_DOMAINS.split(",");
const customDomain = "autostage.me";
if (!domains.includes(customDomain)) {
  domains.push(customDomain);
}

const getOidcConfig = memoize(
  async () => {
    return await Issuer.discover(
      process.env.ISSUER_URL || "https://replit.com/auth/openid"
    );
  },
  { maxAge: 3600 * 1000 }
);

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: true,
    ttl: sessionTtl / 1000, // Convert to seconds
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: true,
      maxAge: sessionTtl,
    },
  });
}

function updateUserSession(
  user: any,
  tokens: TokenSet
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

async function upsertUser(
  claims: any,
) {
  await storage.upsertUser({
    id: claims["sub"],
    email: claims["email"],
    firstName: claims["first_name"],
    lastName: claims["last_name"],
    profileImageUrl: claims["profile_image_url"],
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  const config = await getOidcConfig();

  const verify = async (
    tokens: TokenSet,
    verified: passport.AuthenticateCallback
  ) => {
    const user: any = {};
    updateUserSession(user, tokens);
    await upsertUser(tokens.claims());
    verified(null, user);
  };

  for (const domain of domains) {
    const strategy = new Strategy(
      {
        client: new config.Client({
          client_id: process.env.REPL_ID!,
          client_secret: process.env.REPLIT_CLIENT_SECRET || '',
          redirect_uris: [`https://${domain}/api/callback`],
          response_types: ['code'],
        }),
        params: {
          scope: 'openid email profile offline_access',
        },
        passReqToCallback: false,
      },
      verify,
    );
    passport.use(`replitauth:${domain}`, strategy);
  }

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  app.get("/api/login", (req, res, next) => {
    const strategyName = `replitauth:${req.hostname}`;
    passport.authenticate(strategyName, {
      prompt: "login consent",
      scope: ["openid", "email", "profile", "offline_access"],
    })(req, res, next);
  });

  app.get("/api/callback", (req, res, next) => {
    const strategyName = `replitauth:${req.hostname}`;
    passport.authenticate(strategyName, {
      successReturnToOrRedirect: "/",
      failureRedirect: "/api/login",
    })(req, res, next);
  });

  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      // OpenID Connect end session endpoint
      const endSessionUrl = config.end_session_endpoint;
      if (typeof endSessionUrl === 'string' && endSessionUrl.length > 0) {
        const url = new URL(endSessionUrl);
        url.searchParams.set('client_id', process.env.REPL_ID!);
        url.searchParams.set('post_logout_redirect_uri', `${req.protocol}://${req.hostname}`);
        res.redirect(url.toString());
      } else {
        res.redirect('/');
      }
    });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const user = req.user as any;

  if (!req.isAuthenticated() || !user.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now <= user.expires_at) {
    return next();
  }

  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const config = await getOidcConfig();
    const clientInstance = new config.Client({
      client_id: process.env.REPL_ID!,
      client_secret: process.env.REPLIT_CLIENT_SECRET || '',
    });
    const tokenSet = await clientInstance.refresh(refreshToken);
    updateUserSession(user, tokenSet);
    return next();
  } catch (error) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
};
