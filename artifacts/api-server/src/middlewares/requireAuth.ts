import { type Request, type Response, type NextFunction } from "express";

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.session.userEmail) {
    next();
    return;
  }
  res.status(401).json({ error: "Unauthorized", authenticated: false });
}
