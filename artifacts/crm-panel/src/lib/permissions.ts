import type { Role } from "./auth";
import type { ManagerPermissionKey } from "./manager-permissions";

/**
 * Какие роли могут заходить на каждый роут.
 *
 * Семантика:
 *   - admin / manager / label / artist — список ролей.
 *   - Менеджер (manager) дополнительно гейтится через manager_permissions
 *     (см. ROUTE_MANAGER_PERMISSION_KEY и canAccess).
 *
 * Этап 1 (структура меню) — НЕ меняем сами URL'ы и не запрещаем доступы,
 * которые исторически были у label/artist. Лейблы/артисты пользуются
 * УПРОЩЁННЫМ меню, но если они вручную перейдут на старый URL — он работает
 * как раньше. Хаб-страницы и табы — этап 2.
 */
export const ROUTE_ROLES: Record<string, Role[]> = {
  "/":               ["admin", "manager", "label", "artist"],
  "/analytics":      ["admin", "manager", "label", "artist"],
  "/distribution":   ["admin", "manager"],
  "/releases":       ["admin", "manager", "label", "artist"],
  "/releases/bulk":     ["admin", "manager"],
  "/releases/transfer": ["admin", "manager"],
  "/artists":        ["admin", "manager", "label", "artist"],
  "/labels":         ["admin", "manager"],
  "/videos":         ["admin", "manager"],
  "/users":          ["admin", "manager"],
  "/publishing":     ["admin", "manager"],
  "/crm":            ["admin", "manager"],
  "/royalties":      ["admin", "manager", "label", "artist"],
  "/finance":        ["admin", "manager", "artist"],
  "/finance/import": ["admin", "manager"],
  "/splits":         ["admin", "manager", "label", "artist"],
  "/payouts":        ["admin", "manager", "label", "artist"],
  "/settings":       ["admin", "manager", "label", "artist"], // у каждой роли разное содержимое
  "/profile":        ["admin", "manager", "label", "artist"],
  "/support":        ["admin", "manager", "label", "artist"],
  "/admin/signups":  ["admin", "manager"],
  "/admin/kyc":      ["admin", "manager"],
  "/admin/audit":    ["admin", "manager"],
  "/rights":         ["admin", "manager", "label", "artist"],
  "/catalog":            ["admin", "manager"],
  "/catalog/assets":     ["admin", "manager"],
  "/catalog/duplicates": ["admin", "manager"],
  "/catalog/codes":      ["admin", "manager"],
  "/automation":         ["admin", "manager"],
  "/communications":     ["admin", "manager"],
};

/**
 * Маппинг роута → ключ manager_permissions для гейтинга менеджера.
 * Если ключа нет — менеджер пускается всегда (если ROUTE_ROLES разрешает).
 */
export const ROUTE_MANAGER_PERMISSION_KEY: Record<string, ManagerPermissionKey> = {
  "/catalog":            "catalog",
  "/catalog/assets":     "catalog",
  "/catalog/duplicates": "catalog",
  "/catalog/codes":      "catalog",
  "/releases":           "catalog",
  "/releases/bulk":      "catalog",
  "/releases/transfer":  "catalog",
  "/artists":            "catalog",
  "/labels":             "catalog",
  "/videos":             "catalog",
  "/distribution":       "distribution",
  "/finance":            "finance",
  "/finance/import":     "finance",
  "/royalties":          "finance",
  "/splits":             "finance",
  "/payouts":            "finance",
  "/analytics":          "analytics",
  "/crm":                "crm",
  "/users":              "users_kyc",
  "/admin/signups":      "users_kyc",
  "/admin/kyc":          "users_kyc",
  "/rights":             "rights",
  "/publishing":         "rights",
  "/support":            "support_comms",
  "/communications":     "support_comms",
  "/automation":         "automation_audit",
  "/admin/audit":        "automation_audit",
};

function pickManagerKey(path: string): ManagerPermissionKey | null {
  const exact = ROUTE_MANAGER_PERMISSION_KEY[path];
  if (exact) return exact;
  const prefixes = Object.keys(ROUTE_MANAGER_PERMISSION_KEY)
    .filter((p) => p !== "/" && (path === p || path.startsWith(p + "/")))
    .sort((a, b) => b.length - a.length);
  return prefixes.length > 0 ? ROUTE_MANAGER_PERMISSION_KEY[prefixes[0]] : null;
}

/**
 * Проверка доступа.
 * - admin: всегда (если в ROUTE_ROLES стоит admin)
 * - manager: ROUTE_ROLES + (если есть manager-permission ключ — он должен быть enabled)
 * - label/artist: только ROUTE_ROLES
 *
 * `mgrPerms` опционален — если не передан, manager-permission проверка пропускается
 * (используется в местах, где мы не имеем доступа к hook'у; UI должен передавать).
 */
export function canAccess(
  role: Role,
  path: string,
  mgrPerms?: Record<ManagerPermissionKey, boolean>,
): boolean {
  // 1. Проверяем roles (exact или longest prefix)
  const exact = ROUTE_ROLES[path];
  let allowed: Role[] | undefined = exact;
  if (!allowed) {
    const prefixes = Object.keys(ROUTE_ROLES)
      .filter((p) => p !== "/" && (path === p || path.startsWith(p + "/")))
      .sort((a, b) => b.length - a.length);
    allowed = prefixes.length > 0 ? ROUTE_ROLES[prefixes[0]] : undefined;
  }
  const roleOk = allowed ? allowed.includes(role) : role === "admin";
  if (!roleOk) return false;

  // 2. Дополнительный гейт для manager
  if (role === "manager" && mgrPerms) {
    const key = pickManagerKey(path);
    if (key && mgrPerms[key] === false) return false;
  }
  return true;
}

export const ROLE_LABELS: Record<Role, string> = {
  admin:   "Администратор",
  manager: "Менеджер",
  label:   "Лейбл",
  artist:  "Артист",
};

export const ROLE_COLORS: Record<Role, string> = {
  admin:   "bg-primary/20 text-primary border-primary/30",
  manager: "bg-cyan-500/15 text-cyan-400 border-cyan-500/25",
  label:   "bg-violet-500/15 text-violet-400 border-violet-500/25",
  artist:  "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
};
