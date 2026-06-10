import { db } from "@workspace/db";
import { notificationsTable, type InsertNotification } from "@workspace/db/schema";
import { sseRegistry } from "./sse-registry";

export type CreateNotificationInput = {
  userId: number;
  type: string;
  title: string;
  body?: string;
  entityType?: "release" | "payout" | "track" | "general";
  entityId?: number;
  link?: string;
};

/**
 * Fire-and-forget notification creation.
 * Always call with `void` so individual notification failures never block
 * the primary request.
 *
 * After persisting to DB, emits a real-time SSE push to any open browser
 * tabs of that user so the bell badge and popover update instantly.
 */
export async function createNotification(input: CreateNotificationInput): Promise<void> {
  const row: InsertNotification = {
    userId: input.userId,
    type: input.type,
    title: input.title,
    body: input.body ?? "",
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    link: input.link ?? null,
  };
  await db.insert(notificationsTable).values(row);
  // Push real-time event to all open browser tabs of this user.
  sseRegistry.emit(input.userId, "notification", { type: input.type });
}

/**
 * Create a notification for every user linked to a given artistId.
 * Used when a status change affects all users of that artist.
 */
export async function notifyByArtistId(
  artistId: number,
  input: Omit<CreateNotificationInput, "userId">,
): Promise<void> {
  const { usersTable } = await import("@workspace/db/schema");
  const { eq } = await import("drizzle-orm");
  const users = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.artistId, artistId));
  if (users.length === 0) return;
  const rows: InsertNotification[] = users.map((u) => ({
    userId: u.id,
    type: input.type,
    title: input.title,
    body: input.body ?? "",
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    link: input.link ?? null,
  }));
  await db.insert(notificationsTable).values(rows);
  // Push SSE to each affected user.
  sseRegistry.emitToUsers(users.map((u) => u.id), "notification", { type: input.type });
}

/**
 * Create a notification for every user linked to a given labelId.
 */
export async function notifyByLabelId(
  labelId: number,
  input: Omit<CreateNotificationInput, "userId">,
): Promise<void> {
  const { usersTable } = await import("@workspace/db/schema");
  const { eq } = await import("drizzle-orm");
  const users = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.labelId, labelId));
  if (users.length === 0) return;
  const rows: InsertNotification[] = users.map((u) => ({
    userId: u.id,
    type: input.type,
    title: input.title,
    body: input.body ?? "",
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    link: input.link ?? null,
  }));
  await db.insert(notificationsTable).values(rows);
  // Push SSE to each affected user.
  sseRegistry.emitToUsers(users.map((u) => u.id), "notification", { type: input.type });
}

/**
 * Notify the artist (and optionally the label) linked to a release.
 * Looks up artistId/labelId from the releases table.
 */
export async function notifyByReleaseId(
  releaseId: number,
  input: Omit<CreateNotificationInput, "userId">,
): Promise<void> {
  const { releasesTable } = await import("@workspace/db/schema");
  const { eq } = await import("drizzle-orm");
  const [release] = await db
    .select({ artistId: releasesTable.artistId, labelId: releasesTable.labelId })
    .from(releasesTable)
    .where(eq(releasesTable.id, releaseId));
  if (!release) return;
  await notifyByArtistId(release.artistId, input);
  if (release.labelId) await notifyByLabelId(release.labelId, input);
}

/**
 * Notify all users with role admin or manager.
 * Used for system-level events (new payout requests, etc.).
 */
export async function notifyAdmins(
  input: Omit<CreateNotificationInput, "userId">,
): Promise<void> {
  const { usersTable } = await import("@workspace/db/schema");
  const { inArray } = await import("drizzle-orm");
  const admins = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(inArray(usersTable.role, ["admin", "manager"]));
  if (admins.length === 0) return;
  const rows: InsertNotification[] = admins.map((u) => ({
    userId: u.id,
    type: input.type,
    title: input.title,
    body: input.body ?? "",
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    link: input.link ?? null,
  }));
  await db.insert(notificationsTable).values(rows);
  // Push SSE to all admins/managers.
  sseRegistry.emitToUsers(admins.map((u) => u.id), "notification", { type: input.type });
}
