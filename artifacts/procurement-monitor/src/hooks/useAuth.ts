import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface AuthUser {
  id: string;
  email: string;
  name: string;
  photo?: string;
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

  const login = () => {
    window.location.href = `${API}/auth/google`;
  };

  return {
    user: data?.user ?? null,
    authenticated: data?.authenticated ?? false,
    isLoading,
    login,
    logout: () => logoutMutation.mutate(),
  };
}
