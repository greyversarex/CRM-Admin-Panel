import type { Role } from "./auth";

/** Which roles can access each route */
export const ROUTE_ROLES: Record<string, Role[]> = {
  "/":               ["admin", "manager", "label", "artist"],
  "/analytics":      ["admin", "manager", "label", "artist"],
  "/distribution":   ["admin", "manager", "label"],
  "/releases":       ["admin", "manager", "label", "artist"],
  "/artists":        ["admin", "manager", "label", "artist"],
  "/labels":         ["admin", "manager", "label"],
  "/videos":         ["admin", "manager", "label", "artist"],
  "/users":          ["admin", "manager"],
  "/publishing":     ["admin", "manager", "label"],
  "/rights":         ["admin", "manager", "label"],
  "/crm":            ["admin", "manager", "label"],
  "/communications": ["admin", "manager"],
  "/marketing":      ["admin", "manager"],
  "/finance":        ["admin", "manager", "label", "artist"],
  "/splits":         ["admin", "manager", "label", "artist"],
  "/payouts":        ["admin", "manager", "label", "artist"],
  "/automation":     ["admin"],
  "/settings":       ["admin"],
  "/integrations":   ["admin"],
};

export function canAccess(role: Role, path: string): boolean {
  const allowed = ROUTE_ROLES[path];
  if (!allowed) return role === "admin";
  return allowed.includes(role);
}

/** Human-readable role labels */
export const ROLE_LABELS: Record<Role, string> = {
  admin:   "Администратор",
  manager: "Менеджер",
  label:   "Лейбл",
  artist:  "Артист",
};

/** Role badge colours */
export const ROLE_COLORS: Record<Role, string> = {
  admin:   "bg-primary/20 text-primary border-primary/30",
  manager: "bg-cyan-500/15 text-cyan-400 border-cyan-500/25",
  label:   "bg-violet-500/15 text-violet-400 border-violet-500/25",
  artist:  "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
};
