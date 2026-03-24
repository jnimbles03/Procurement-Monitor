import { type Request, type Response, type NextFunction } from "express";

const oauthConfigured = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!oauthConfigured) {
    next();
    return;
  }
  if (req.isAuthenticated()) {
    next();
    return;
  }
  res.status(401).json({ error: "Unauthorized", authenticated: false });
}
