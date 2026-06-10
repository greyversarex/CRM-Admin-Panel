/**
 * SSE Registry — in-memory store of per-user Server-Sent Events connections.
 *
 * When a notification is created for a user, call sseRegistry.emit() to
 * instantly push a "notification" event to all open browser tabs of that user.
 *
 * Registry is intentionally process-local: a single Node.js process handles
 * all API requests on this deployment, so in-memory state is correct.
 * For multi-process deployments, replace the Map with Redis pub/sub.
 */

import type { Response } from "express";

class SseRegistry {
  /** userId → Set of active SSE response streams */
  private connections = new Map<number, Set<Response>>();

  /** Register a new SSE connection for a user. */
  subscribe(userId: number, res: Response): void {
    if (!this.connections.has(userId)) {
      this.connections.set(userId, new Set());
    }
    this.connections.get(userId)!.add(res);
  }

  /** Remove an SSE connection (called on request close). */
  unsubscribe(userId: number, res: Response): void {
    const set = this.connections.get(userId);
    if (!set) return;
    set.delete(res);
    if (set.size === 0) this.connections.delete(userId);
  }

  /**
   * Push a named SSE event to all open connections for a given user.
   * Write errors are swallowed — the connection will be cleaned up
   * when the browser fires the close event on the request.
   */
  emit(userId: number, event: string, data: unknown): void {
    const set = this.connections.get(userId);
    if (!set || set.size === 0) return;
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of set) {
      try {
        res.write(payload);
      } catch {
        // Connection already closed; will be cleaned up via req.on("close")
      }
    }
  }

  /** Push to multiple users at once (e.g. notify all admins). */
  emitToUsers(userIds: number[], event: string, data: unknown): void {
    for (const uid of userIds) {
      this.emit(uid, event, data);
    }
  }

  /** Total active connection count (for monitoring/debugging). */
  get size(): number {
    let n = 0;
    for (const set of this.connections.values()) n += set.size;
    return n;
  }
}

export const sseRegistry = new SseRegistry();
