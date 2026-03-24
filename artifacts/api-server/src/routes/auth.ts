import { Router, type Request, type Response } from "express";
import { ALLOWED_DOMAIN } from "../lib/auth";

const router = Router();

declare module "express-session" {
  interface SessionData {
    userEmail: string;
  }
}

router.post("/auth/login", (req: Request, res: Response): void => {
  const email = String(req.body.email ?? "").trim().toLowerCase();

  if (!email) {
    res.status(400).json({ error: "Email is required" });
    return;
  }

  if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) {
    res.status(403).json({ error: `Only @${ALLOWED_DOMAIN} accounts are permitted` });
    return;
  }

  req.session.userEmail = email;
  req.session.save((err) => {
    if (err) {
      res.status(500).json({ error: "Failed to create session" });
      return;
    }
    res.json({ success: true, email });
  });
});

router.get("/auth/user", (req: Request, res: Response): void => {
  const email = req.session.userEmail;
  if (email) {
    res.json({ user: { email }, authenticated: true });
  } else {
    res.json({ user: null, authenticated: false });
  }
});

router.post("/auth/logout", (req: Request, res: Response): void => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

export default router;
