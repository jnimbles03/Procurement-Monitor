import { Router, type Request, type Response } from "express";
import { ALLOWED_DOMAIN } from "../lib/auth";

const router = Router();

declare module "express-session" {
  interface SessionData {
    userEmail: string;
    pendingEmail: string;
    challengeIdx: number;
  }
}

// Pool of knowledge-based challenge questions.
// One is picked at random each login attempt.
const CHALLENGE_QUESTIONS: { question: string; answer: string }[] = [
  { question: "What is the slogan for our team?", answer: "#GSD" },
];

// Step 1 — validate email domain, issue a challenge question.
// Does NOT create a real session yet.
router.post("/auth/login", (req: Request, res: Response): void => {
  const email = String(req.body.email ?? "").trim().toLowerCase();

  if (!email) {
    res.status(400).json({ error: "Email is required" });
    return;
  }

  if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const idx = Math.floor(Math.random() * CHALLENGE_QUESTIONS.length);
  req.session.pendingEmail = email;
  req.session.challengeIdx = idx;
  req.session.save((err) => {
    if (err) {
      res.status(500).json({ error: "Session error" });
      return;
    }
    res.json({ step: "challenge", question: CHALLENGE_QUESTIONS[idx].question });
  });
});

// Step 2 — validate challenge answer, create the real session.
router.post("/auth/challenge", (req: Request, res: Response): void => {
  const pendingEmail = req.session.pendingEmail;
  const idx = req.session.challengeIdx;
  const answer = String(req.body.answer ?? "").trim();

  if (!pendingEmail || idx === undefined) {
    res.status(400).json({ error: "No pending authentication — please restart login" });
    return;
  }

  const correct = CHALLENGE_QUESTIONS[idx]?.answer ?? "";
  if (answer.toLowerCase() !== correct.toLowerCase()) {
    // Clear the pending state so the user must restart
    req.session.pendingEmail = undefined as unknown as string;
    req.session.challengeIdx = undefined as unknown as number;
    req.session.save(() => {
      res.status(403).json({ error: "Incorrect answer — please try again from the beginning" });
    });
    return;
  }

  req.session.userEmail = pendingEmail;
  req.session.pendingEmail = undefined as unknown as string;
  req.session.challengeIdx = undefined as unknown as number;
  req.session.save((err) => {
    if (err) {
      res.status(500).json({ error: "Failed to create session" });
      return;
    }
    res.json({ success: true, email: pendingEmail });
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
