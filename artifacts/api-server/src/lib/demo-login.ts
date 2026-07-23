export const DEMO_ROLES = ["admin", "manager", "label", "artist"] as const;

export type DemoRole = (typeof DEMO_ROLES)[number];

// Kept server-side so the frontend production bundle contains neither demo
// passwords nor the account mapping used by the one-click login endpoint.
const DEMO_ACCOUNT_EMAILS: Record<DemoRole, string> = {
  admin: "admin@tajikmusic.com",
  manager: "manager@tajikmusic.com",
  label: "label@tajikmusic.com",
  artist: "artist@tajikmusic.com",
};

export function isDemoLoginEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const value = env["DEMO_LOGIN_ENABLED"]?.trim().toLowerCase();
  return value === "1" || value === "true";
}

export function isDemoRole(value: unknown): value is DemoRole {
  return typeof value === "string" && DEMO_ROLES.includes(value as DemoRole);
}

export function getDemoAccountEmail(role: DemoRole): string {
  return DEMO_ACCOUNT_EMAILS[role];
}

