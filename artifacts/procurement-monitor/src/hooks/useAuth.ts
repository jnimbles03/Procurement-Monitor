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

  const loginMutation = useMutation({
    mutationFn: async (email: string) => {
      const res = await fetch(`${API}/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error: string };
        throw new Error(data.error ?? "Login failed");
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
    login: (email: string) => loginMutation.mutateAsync(email),
    loginPending: loginMutation.isPending,
    loginError: loginMutation.error?.message ?? null,
    logout: () => logoutMutation.mutate(),
  };
}
