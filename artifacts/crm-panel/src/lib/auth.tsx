import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type Role = "admin" | "manager" | "label" | "artist";

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  artistId?: number | null;
  labelId?: number | null;
  avatarInitials: string;
  orgName?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  loginAs: (role: Role) => void;
  logout: () => void;
  isLoading: boolean;
}

const DEMO_USERS: Record<string, AuthUser & { password: string }> = {
  "admin@tajikmusic.com": {
    id: 1, password: "admin123",
    name: "Admin User", email: "admin@tajikmusic.com",
    role: "admin", avatarInitials: "AU",
  },
  "manager@tajikmusic.com": {
    id: 2, password: "manager123",
    name: "Рустам Назаров", email: "manager@tajikmusic.com",
    role: "manager", avatarInitials: "РН",
  },
  "label@tajikmusic.com": {
    id: 3, password: "label123",
    name: "Звук Азии Records", email: "label@tajikmusic.com",
    role: "label", labelId: 1, avatarInitials: "ЗА",
    orgName: "Звук Азии Records",
  },
  "artist@tajikmusic.com": {
    id: 4, password: "artist123",
    name: "Ансамбли Бахор", email: "artist@tajikmusic.com",
    role: "artist", artistId: 1, avatarInitials: "АБ",
    orgName: "Ансамбли Бахор",
  },
};

const DEMO_BY_ROLE: Record<Role, string> = {
  admin:   "admin@tajikmusic.com",
  manager: "manager@tajikmusic.com",
  label:   "label@tajikmusic.com",
  artist:  "artist@tajikmusic.com",
};

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = "tm_auth_user";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setUser(JSON.parse(raw));
    } catch { /* ignore */ }
    setIsLoading(false);
  }, []);

  const persist = (u: AuthUser | null) => {
    setUser(u);
    if (u) localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
    else localStorage.removeItem(STORAGE_KEY);
  };

  const login = async (email: string, password: string) => {
    const found = DEMO_USERS[email.toLowerCase().trim()];
    if (!found || found.password !== password) {
      return { ok: false, error: "Неверный email или пароль" };
    }
    const { password: _pw, ...authUser } = found;
    persist(authUser);
    return { ok: true };
  };

  const loginAs = (role: Role) => {
    const email = DEMO_BY_ROLE[role];
    const found = DEMO_USERS[email];
    if (found) {
      const { password: _pw, ...authUser } = found;
      persist(authUser);
    }
  };

  const logout = () => persist(null);

  return (
    <AuthContext.Provider value={{ user, login, loginAs, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
