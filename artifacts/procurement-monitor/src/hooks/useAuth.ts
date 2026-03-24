import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface AuthUser {
  email: string;
}

interface AuthState {
  user: AuthUser | null;
  authenticated: boolean;
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = `${BASE}/api`;

async function fetchAuthState(): Promise<AuthState> {
  const res = await fetch(`${API}/auth/user`, { credentials: "include" });
  if (!res.ok) return { user: null, authenticated: false };
  return res.json() as Promise<AuthState>;
}

export function useAuth() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["auth-user"],
    queryFn: fetchAuthState,
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  // Step 1: submit email → returns challenge question
  const loginMutation = useMutation({
    mutationFn: async (email: string) => {
      const res = await fetch(`${API}/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error: string };
        throw new Error(body.error ?? "Login failed");
      }
      return res.json() as Promise<{ step: "challenge"; question: string }>;
    },
  });

  // Step 2: submit challenge answer → creates session
  const challengeMutation = useMutation({
    mutationFn: async (answer: string) => {
      const res = await fetch(`${API}/auth/challenge`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error: string };
        throw new Error(body.error ?? "Incorrect answer");
      }
      return res.json() as Promise<{ success: boolean; email: string }>;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["auth-user"] });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await fetch(`${API}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    },
    onSuccess: () => {
      qc.setQueryData(["auth-user"], { user: null, authenticated: false });
      qc.clear();
    },
  });

  return {
    user: data?.user ?? null,
    authenticated: data?.authenticated ?? false,
    isLoading,

    // Step 1
    submitEmail: (email: string) => loginMutation.mutateAsync(email),
    emailPending: loginMutation.isPending,
    emailError: loginMutation.error?.message ?? null,

    // Step 2
    submitChallenge: (answer: string) => challengeMutation.mutateAsync(answer),
    challengePending: challengeMutation.isPending,
    challengeError: challengeMutation.error?.message ?? null,

    logout: () => logoutMutation.mutate(),
  };
}
