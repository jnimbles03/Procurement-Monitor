import { useState } from "react";
import { ShieldAlert, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";

type Step = "email" | "challenge";

export default function Login() {
  const {
    authenticated,
    submitEmail, emailPending, emailError,
    submitChallenge, challengePending, challengeError,
  } = useAuth();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [, navigate] = useLocation();

  if (authenticated) {
    navigate("/");
    return null;
  }

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await submitEmail(email.trim());
      setQuestion(res.question);
      setAnswer("");
      setStep("challenge");
    } catch {
      // error shown via emailError
    }
  };

  const handleChallengeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await submitChallenge(answer.trim());
      navigate("/");
    } catch (err) {
      // If the server cleared the pending session (wrong answer), go back to start
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("restart") || msg.includes("beginning")) {
        setStep("email");
        setAnswer("");
      }
    }
  };

  return (
    <div className="min-h-screen bg-sidebar flex items-center justify-center p-6">
      <div className="bg-card rounded-2xl shadow-2xl border border-border/60 p-10 w-full max-w-sm flex flex-col items-center gap-8">
        {/* Logo */}
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="bg-primary/15 p-4 rounded-2xl">
            <ShieldAlert className="w-10 h-10 text-primary" />
          </div>
          <div>
            <h1 className="font-display font-bold text-2xl text-foreground leading-tight">
              Procurement Monitor
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Public Sector Intelligence</p>
          </div>
        </div>

        {/* Step 1: Email */}
        {step === "email" && (
          <form onSubmit={handleEmailSubmit} className="w-full flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-sm font-medium text-foreground">
                Work email
              </label>
              <Input
                id="email"
                type="email"
                placeholder="your@work-email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={emailPending}
                autoFocus
                className="h-11"
              />
            </div>

            {emailError && (
              <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2 text-center">
                {emailError}
              </p>
            )}

            <Button
              type="submit"
              className="w-full h-11 font-semibold"
              disabled={emailPending || !email.trim()}
            >
              {emailPending ? "Checking…" : "Continue"}
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              Access is restricted to authorized accounts only
            </p>
          </form>
        )}

        {/* Step 2: Challenge question */}
        {step === "challenge" && (
          <form onSubmit={handleChallengeSubmit} className="w-full flex flex-col gap-3">
            <div className="text-xs text-muted-foreground text-center mb-1">
              Signed in as <span className="font-medium text-foreground">{email}</span>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="answer" className="text-sm font-medium text-foreground">
                {question}
              </label>
              <Input
                id="answer"
                type="text"
                placeholder="Your answer"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                disabled={challengePending}
                autoFocus
                className="h-11"
              />
            </div>

            {challengeError && (
              <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2 text-center">
                {challengeError}
              </p>
            )}

            <Button
              type="submit"
              className="w-full h-11 font-semibold"
              disabled={challengePending || !answer.trim()}
            >
              {challengePending ? "Verifying…" : "Sign in"}
            </Button>

            <button
              type="button"
              onClick={() => { setStep("email"); setAnswer(""); }}
              className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mx-auto"
            >
              <ArrowLeft className="w-3 h-3" />
              Use a different email
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
