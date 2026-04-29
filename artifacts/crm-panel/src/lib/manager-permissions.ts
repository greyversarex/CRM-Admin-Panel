import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Role } from "./auth";

export const MANAGER_PERMISSION_KEYS = [
  "catalog",
  "distribution",
  "finance",
  "analytics",
  "crm",
  "users_kyc",
  "rights",
  "support_comms",
  "automation_audit",
] as const;

export type ManagerPermissionKey = typeof MANAGER_PERMISSION_KEYS[number];

export interface ManagerPermissionItem {
  key: ManagerPermissionKey;
  enabled: boolean;
  updatedAt: string | null;
  updatedBy: number | null;
}

const QK = ["manager-permissions"] as const;

async function fetchPermissions(): Promise<Record<ManagerPermissionKey, boolean>> {
  const r = await fetch("/api/manager-permissions", { credentials: "include" });
  if (!r.ok) {
    // Не админ → 403; для UI это значит «всё включено» (label/artist вообще не используют этот hook).
    if (r.status === 403 || r.status === 401) {
      return Object.fromEntries(MANAGER_PERMISSION_KEYS.map((k) => [k, true])) as Record<ManagerPermissionKey, boolean>;
    }
    throw new Error(`fetch manager-permissions failed: ${r.status}`);
  }
  const json = (await r.json()) as { items: ManagerPermissionItem[] };
  const out = Object.fromEntries(MANAGER_PERMISSION_KEYS.map((k) => [k, true])) as Record<ManagerPermissionKey, boolean>;
  for (const it of json.items) out[it.key] = it.enabled;
  return out;
}

/**
 * Hook: возвращает `Record<key, enabled>` для всех manager-разрешений.
 * Для admin / manager — реальные данные из API (cached 60s).
 * Для label / artist — статически "всё включено" (этот hook у них не должен ничего вызывать,
 *   но всё равно возвращаем безопасный дефолт чтобы не было undefined-проверок в UI).
 */
export function useManagerPermissions(role: Role | undefined) {
  const enabled = role === "admin" || role === "manager";
  const q = useQuery({
    queryKey: QK,
    queryFn: fetchPermissions,
    enabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  if (!enabled) {
    return {
      perms: Object.fromEntries(MANAGER_PERMISSION_KEYS.map((k) => [k, true])) as Record<ManagerPermissionKey, boolean>,
      isLoading: false,
      isError: false,
    };
  }
  return {
    perms: q.data ?? Object.fromEntries(MANAGER_PERMISSION_KEYS.map((k) => [k, true])) as Record<ManagerPermissionKey, boolean>,
    isLoading: q.isLoading,
    isError: q.isError,
  };
}

export function useFullManagerPermissions() {
  return useQuery({
    queryKey: ["manager-permissions", "full"],
    queryFn: async (): Promise<ManagerPermissionItem[]> => {
      const r = await fetch("/api/manager-permissions", { credentials: "include" });
      if (!r.ok) throw new Error(`fetch manager-permissions failed: ${r.status}`);
      const json = (await r.json()) as { items: ManagerPermissionItem[] };
      return json.items;
    },
    staleTime: 60_000,
  });
}

export function useTogglePermission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, enabled }: { key: ManagerPermissionKey; enabled: boolean }) => {
      const r = await fetch(`/api/manager-permissions/${key}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (!r.ok) throw new Error(`PATCH manager-permissions failed: ${r.status}`);
      return (await r.json()) as { ok: true; item: ManagerPermissionItem };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["manager-permissions"] });
      qc.invalidateQueries({ queryKey: ["manager-permissions", "full"] });
    },
  });
}
