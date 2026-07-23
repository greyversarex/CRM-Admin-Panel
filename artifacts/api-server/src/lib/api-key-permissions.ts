/**
 * Permission vocabulary and route mapping for API-key authentication.
 *
 * API keys are deliberately denied when a route has no mapping. Adding a new
 * route therefore never grants API-key access accidentally: the route must be
 * assigned to one of the resources below first.
 */

export const API_KEY_RESOURCES = [
  "analytics",
  "artists",
  "assets",
  "automation",
  "catalog",
  "communications",
  "crm",
  "deliveries",
  "distribution",
  "finance",
  "kyc",
  "labels",
  "marketing",
  "publishing",
  "releases",
  "rights",
  "royalties",
  "splits",
  "support",
  "tracks",
  "users",
] as const;

export type ApiKeyResource = (typeof API_KEY_RESOURCES)[number];
export type ApiKeyAction = "read" | "write";
export type ApiKeyPermission = `${ApiKeyAction}:${ApiKeyResource}`;

export const API_KEY_PERMISSIONS = API_KEY_RESOURCES.flatMap((resource) => [
  `read:${resource}` as ApiKeyPermission,
  `write:${resource}` as ApiKeyPermission,
]);

const API_KEY_PERMISSION_SET = new Set<string>(API_KEY_PERMISSIONS);

const RESOURCE_BY_FIRST_PATH_SEGMENT: Readonly<Record<string, ApiKeyResource>> = {
  analytics: "analytics",
  dashboard: "analytics",
  artists: "artists",
  assets: "assets",
  storage: "assets",
  automation: "automation",
  catalog: "catalog",
  communications: "communications",
  notifications: "communications",
  contacts: "crm",
  crm: "crm",
  deliveries: "deliveries",
  broma16: "distribution",
  ddex: "distribution",
  distribution: "distribution",
  takedowns: "distribution",
  finance: "finance",
  payouts: "finance",
  kyc: "kyc",
  labels: "labels",
  "label-members": "labels",
  marketing: "marketing",
  playlists: "marketing",
  publishing: "publishing",
  releases: "releases",
  "dsp-catalog": "releases",
  rights: "rights",
  royalties: "royalties",
  splits: "splits",
  support: "support",
  tracks: "tracks",
  users: "users",
  "signup-requests": "users",
};

export function isApiKeyPermission(value: string): value is ApiKeyPermission {
  return API_KEY_PERMISSION_SET.has(value);
}

export function sanitizeApiKeyPermissions(values: readonly string[]): ApiKeyPermission[] {
  return [...new Set(values.filter(isApiKeyPermission))];
}

function getApiRelativePath(originalUrl: string): string {
  const pathOnly = originalUrl.split("?", 1)[0] || "/";
  return pathOnly.replace(/^\/api(?=\/|$)/i, "") || "/";
}

/**
 * Resolve the single permission needed for a request.
 *
 * `null` means that API-key authentication is not supported for this route.
 * This includes credential/system administration endpoints such as /api-keys,
 * /settings, /integrations, /webhooks and /manager-permissions.
 */
export function getRequiredApiKeyPermission(
  method: string,
  originalUrl: string,
): ApiKeyPermission | null {
  const path = getApiRelativePath(originalUrl).toLowerCase();
  const segments = path.split("/").filter(Boolean);
  if (segments.length === 0) return null;

  // KYC review endpoints are mounted under /admin for historical reasons, but
  // remain a dedicated API-key capability rather than a generic admin scope.
  if (
    segments[0] === "admin"
    && (
      segments[1] === "kyc"
      || segments[1] === "kyc-documents"
      || (segments[1] === "users" && segments[3] === "kyc")
    )
  ) {
    const action: ApiKeyAction = ["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase())
      ? "read"
      : "write";
    return `${action}:kyc`;
  }

  // Delivery is a separate capability even though this command is mounted
  // below /releases in the human-facing API.
  if (
    segments[0] === "releases"
    && segments.length >= 3
    && segments[2] === "deliver"
  ) {
    return "write:deliveries";
  }

  const resource = RESOURCE_BY_FIRST_PATH_SEGMENT[segments[0]];
  if (!resource) return null;

  const normalizedMethod = method.toUpperCase();
  const action: ApiKeyAction = normalizedMethod === "GET"
    || normalizedMethod === "HEAD"
    || normalizedMethod === "OPTIONS"
    ? "read"
    : "write";

  return `${action}:${resource}`;
}

export function canApiKeyAccess(
  permissions: readonly string[],
  method: string,
  originalUrl: string,
): { allowed: boolean; requiredPermission: ApiKeyPermission | null } {
  const requiredPermission = getRequiredApiKeyPermission(method, originalUrl);
  return {
    allowed: requiredPermission !== null && permissions.includes(requiredPermission),
    requiredPermission,
  };
}
