import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";

export type Role = "admin" | "manager" | "label" | "artist";

export type DspProfiles = {
  appleMusic?: string;
  spotify?: string;
  yandex?: string;
  youtube?: string;
};

export type SocialLinks = {
  facebook?: string;
  instagram?: string;
  youtube?: string;
  tiktok?: string;
  linkedin?: string;
  x?: string;
  telegram?: string;
  vk?: string;
};

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  artistId?: number | null;
  labelId?: number | null;
  avatarUrl?: string | null;
  phone?: string | null;
  address?: string | null;
  country?: string | null;
  region?: string | null;
  city?: string | null;
  zipCode?: string | null;
  about?: string | null;
  dspProfiles: DspProfiles;
  socialLinks: SocialLinks;
  // Derived
  avatarInitials: string;
  orgName?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  loginAs: (role: Role) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  isLoading: boolean;
}

const DEMO_PASSWORDS: Record<Role, { email: string; password: string }> = {
  admin:   { email: "admin@tajikmusic.com",   password: "admin123" },
  manager: { email: "manager@tajikmusic.com", password: "manager123" },
  label:   { email: "label@tajikmusic.com",   password: "label123" },
  artist:  { email: "artist@tajikmusic.com",  password: "artist123" },
};

const AuthContext = createContext<AuthContextValue | null>(null);

function deriveAuthUser(raw: any): AuthUser {
  const initials = String(raw.name ?? "")
    .split(/\s+/)
    .map((s: string) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "U";
  return {
    id: raw.id,
    name: raw.name,
    email: raw.email,
    role: raw.role,
    artistId: raw.artistId ?? null,
    labelId: raw.labelId ?? null,
    avatarUrl: raw.avatarUrl ?? null,
    phone: raw.phone ?? null,
    address: raw.address ?? null,
    country: raw.country ?? null,
    region: raw.region ?? null,
    city: raw.city ?? null,
    zipCode: raw.zipCode ?? null,
    about: raw.about ?? null,
    dspProfiles: (raw.dspProfiles ?? {}) as DspProfiles,
    socialLinks: (raw.socialLinks ?? {}) as SocialLinks,
    avatarInitials: initials,
    orgName: raw.role === "label" || raw.role === "artist" ? raw.name : undefined,
  };
}

async function apiJson<T>(url: string, init?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; error: string; status: number }> {
  try {
    const res = await fetch(url, {
      ...init,
      credentials: "same-origin",
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try { const j = await res.json(); msg = j.error || msg; } catch { /* ignore */ }
      return { ok: false, error: msg, status: res.status };
    }
    const data = (await res.json()) as T;
    return { ok: true, data };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Network error", status: 0 };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    const r = await apiJson<{ user: any }>("/api/auth/me");
    if (r.ok) setUser(deriveAuthUser(r.data.user));
    else setUser(null);
  }, []);

  useEffect(() => {
    (async () => {
      await refresh();
      setIsLoading(false);
    })();
  }, [refresh]);

  const login = async (email: string, password: string) => {
    const r = await apiJson<{ user: any }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    if (!r.ok) return { ok: false, error: r.error };
    setUser(deriveAuthUser(r.data.user));
    return { ok: true };
  };

  const loginAs = async (role: Role) => {
    const creds = DEMO_PASSWORDS[role];
    return login(creds.email, creds.password);
  };

  const logout = async () => {
    await apiJson("/api/auth/logout", { method: "POST" });
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, loginAs, logout, refresh, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
