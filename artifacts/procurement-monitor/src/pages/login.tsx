import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";

export default function Login() {
  const { login, loginPending, loginError, authenticated } = useAuth();
  const [email, setEmail] = useState("");
  const [, navigate] = useLocation();

  if (authenticated) {
    navigate("/");
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login(email.trim());
      navigate("/");
    } catch {
      // error shown via loginError
    }
  };

  return (
    <div className="min-h-screen bg-sidebar flex items-center justify-center p-6">
      <div className="bg-card rounded-2xl shadow-2xl border border-border/60 p-10 w-full max-w-sm flex flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="bg-primary/15 p-4 rounded-2xl">
            <ShieldAlert className="w-10 h-10 text-primary" />
          </div>
          <div>
            <h1 className="font-display font-bold text-2xl text-foreground leading-tight">
              Procurement Monitor
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Public Sector Intelligence
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="w-full flex flex-col gap-3">
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
              disabled={loginPending}
              autoFocus
              className="h-11"
            />
          </div>

          {loginError && (
            <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2 text-center">
              {loginError}
            </p>
          )}

          <Button
            type="submit"
            className="w-full h-11 font-semibold"
            disabled={loginPending || !email.trim()}
          >
            {loginPending ? "Signing in…" : "Sign in"}
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            Access is restricted to authorized accounts only
          </p>
        </form>
      </div>
    </div>
  );
}
