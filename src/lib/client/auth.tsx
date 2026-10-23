"use client";
import { onIdTokenChanged, signOut, type User } from "firebase/auth";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { clientAuth } from "./firebase";

export interface Me {
  email: string | null;
  role: "admin" | "staff";
  facilityId: string;
  facilityName: string;
  aiEnabled: boolean;
}

interface AuthState {
  user: User | null;
  me: Me | null;
  loading: boolean;
  error: string | null;
  api: <T>(path: string, init?: RequestInit) => Promise<T>;
  refreshMe: () => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const api = useCallback(
    async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
      const current = clientAuth().currentUser;
      if (!current) throw new ApiError(401, "ログインが必要です");
      const token = await current.getIdToken();
      const res = await fetch(path, {
        ...init,
        headers: {
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          ...init.headers,
          Authorization: `Bearer ${token}`,
        },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new ApiError(res.status, body.error ?? "通信に失敗しました");
      return body as T;
    },
    [],
  );

  const refreshMe = useCallback(async () => {
    try {
      setMe(await api<Me>("/api/me"));
      setError(null);
    } catch (e) {
      setMe(null);
      setError(e instanceof Error ? e.message : "アカウント情報を取得できませんでした");
    }
  }, [api]);

  useEffect(() => {
    return onIdTokenChanged(clientAuth(), async (u) => {
      setUser(u);
      if (u) await refreshMe();
      else setMe(null);
      setLoading(false);
    });
  }, [refreshMe]);

  const logout = useCallback(async () => {
    await signOut(clientAuth());
  }, []);

  return <Ctx.Provider value={{ user, me, loading, error, api, refreshMe, logout }}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth は AuthProvider の中で使ってください");
  return v;
}
