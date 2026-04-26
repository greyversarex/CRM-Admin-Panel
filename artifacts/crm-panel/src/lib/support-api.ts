/**
 * Тонкий клиент для /api/support/* — обходим orval (сломан в 8.5.3) и
 * используем прямой fetch + TanStack Query. Один файл, чтобы не плодить хуки.
 */
import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query";

// ─── Типы ──────────────────────────────────────────────────────────────────

export type TicketStatus = "open" | "in_progress" | "waiting" | "resolved" | "closed";
export type TicketPriority = "low" | "medium" | "high" | "urgent";
export type TicketCategory =
  | "general" | "finance" | "distribution" | "catalog"
  | "marketing" | "account" | "bug" | "other";

export interface AuthorRef {
  id: number;
  name: string;
  email: string;
  role: string;
}

export interface SupportTicket {
  id: number;
  ticketRef: string;
  subject: string;
  category: TicketCategory;
  status: TicketStatus;
  priority: TicketPriority;
  requester: AuthorRef | null;
  assignee: AuthorRef | null;
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface TicketMessage {
  id: number;
  ticketId: number;
  body: string;
  isInternal: boolean;
  author: AuthorRef | null;
  createdAt: string;
}

export interface TicketDetails {
  ticket: SupportTicket;
  messages: TicketMessage[];
}

export const CATEGORY_LABELS: Record<string, string> = {
  general:      "Общий",
  finance:      "Финансы",
  distribution: "Дистрибуция",
  catalog:      "Каталог",
  marketing:    "Маркетинг",
  account:      "Аккаунт",
  bug:          "Ошибка",
  other:        "Другое",
};

// ─── Базовый fetch helper ──────────────────────────────────────────────────

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "same-origin",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    ...init,
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      msg = j?.error ?? msg;
    } catch { /* noop */ }
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ─── Фильтры списка ────────────────────────────────────────────────────────

export interface TicketsFilter {
  status?: TicketStatus | "";
  priority?: TicketPriority | "";
  category?: TicketCategory | "";
  /** number ID, "me", "unassigned" — только для staff. */
  assignee?: string;
}

function buildQuery(f: TicketsFilter): string {
  const p = new URLSearchParams();
  if (f.status) p.set("status", f.status);
  if (f.priority) p.set("priority", f.priority);
  if (f.category) p.set("category", f.category);
  if (f.assignee) p.set("assignee", f.assignee);
  const s = p.toString();
  return s ? `?${s}` : "";
}

// ─── Query keys ────────────────────────────────────────────────────────────

export const supportKeys = {
  all: ["support"] as const,
  ticketsList: (f: TicketsFilter) => ["support", "tickets", f] as const,
  ticket:      (id: number | null) => ["support", "ticket", id] as const,
  agents:      () => ["support", "agents"] as const,
};

// ─── Хуки списка / деталей ─────────────────────────────────────────────────

export function useSupportTickets(
  filter: TicketsFilter,
  options?: Omit<UseQueryOptions<{ data: SupportTicket[] }>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: supportKeys.ticketsList(filter),
    queryFn: () => api<{ data: SupportTicket[] }>(`/api/support/tickets${buildQuery(filter)}`),
    staleTime: 10_000,
    ...options,
  });
}

export function useTicketDetails(id: number | null) {
  return useQuery({
    queryKey: supportKeys.ticket(id),
    queryFn: () => api<TicketDetails>(`/api/support/tickets/${id}`),
    enabled: id !== null,
    staleTime: 5_000,
  });
}

export function useSupportAgents(enabled: boolean = true) {
  return useQuery({
    queryKey: supportKeys.agents(),
    queryFn: () => api<{ data: AuthorRef[] }>(`/api/support/agents`),
    enabled,
    staleTime: 60_000,
  });
}

// ─── Мутации ───────────────────────────────────────────────────────────────

export function useCreateSupportTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      subject: string;
      category: string;
      priority: string;
      body: string;
    }) =>
      api<{ ticket: SupportTicket }>(`/api/support/tickets`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      // Любой список тикетов теперь устарел.
      qc.invalidateQueries({ queryKey: ["support", "tickets"] });
    },
  });
}

export function useReplyToTicket(ticketId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { body: string; isInternal?: boolean }) => {
      if (ticketId === null) throw new Error("ticketId is null");
      return api<{ message: TicketMessage }>(
        `/api/support/tickets/${ticketId}/messages`,
        { method: "POST", body: JSON.stringify(input) },
      );
    },
    onSuccess: () => {
      if (ticketId !== null) qc.invalidateQueries({ queryKey: supportKeys.ticket(ticketId) });
      qc.invalidateQueries({ queryKey: ["support", "tickets"] });
    },
  });
}

export function useUpdateTicket(ticketId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      status?: TicketStatus;
      priority?: TicketPriority;
      assigneeUserId?: number | null;
    }) => {
      if (ticketId === null) throw new Error("ticketId is null");
      return api<{ ticket: SupportTicket }>(
        `/api/support/tickets/${ticketId}`,
        { method: "PATCH", body: JSON.stringify(input) },
      );
    },
    onSuccess: () => {
      if (ticketId !== null) qc.invalidateQueries({ queryKey: supportKeys.ticket(ticketId) });
      qc.invalidateQueries({ queryKey: ["support", "tickets"] });
    },
  });
}
