import { Router, type Request, type Response, type NextFunction } from "express";
import { passport } from "../lib/auth";

const router = Router();

const oauthConfigured = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

router.get("/auth/google", (req: Request, res: Response, next: NextFunction) => {
  if (!oauthConfigured) {
    res.status(503).json({ error: "Google OAuth not configured" });
    return;
  }
  passport.authenticate("google", { scope: ["profile", "email"] })(req, res, next);
});

router.get(
  "/auth/google/callback",
  (req: Request, res: Response, next: NextFunction) => {
    passport.authenticate("google", {
      failureRedirect: `/login?error=domain`,
    })(req, res, next);
  },
  (_req: Request, res: Response) => {
    res.redirect("/");
  },
);

router.get("/auth/user", (req: Request, res: Response) => {
  if (!oauthConfigured) {
    res.json({ user: null, authenticated: true, oauthConfigured: false });
    return;
  }
  if (req.isAuthenticated()) {
    res.json({ user: req.user, authenticated: true, oauthConfigured: true });
  } else {
    res.json({ user: null, authenticated: false, oauthConfigured: true });
  }
});

router.post("/auth/logout", (req: Request, res: Response, next: NextFunction) => {
  req.logout((err) => {
    if (err) return next(err);
    req.session.destroy(() => {
      res.json({ success: true });
    });
  });
});

export default router;
