import { useEffect, useRef, useState } from "react";
import { Bell, CheckCheck, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  useListNotifications,
  useGetUnreadNotificationCount,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  getListNotificationsQueryKey,
  getGetUnreadNotificationCountQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";

const TYPE_ICONS: Record<string, string> = {
  release_approved: "✅",
  release_rejected: "❌",
  release_submitted: "📤",
  release_live: "🎵",
  release_takedown: "⚠️",
  payout_approved: "💸",
  payout_rejected: "🚫",
  payout_requested: "💰",
  delivery_sent: "📦",
  delivery_failed: "❌",
  general: "📣",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "только что";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} мин. назад`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ч. назад`;
  const d = Math.floor(h / 24);
  return `${d} д. назад`;
}

export function NotificationsPopover() {
  const [open, setOpen] = useState(false);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: countData } = useGetUnreadNotificationCount({
    query: { queryKey: getGetUnreadNotificationCountQueryKey(), refetchInterval: 30_000 },
  } as never);

  const unreadCount: number = (countData as any)?.count ?? 0;

  const { data: notifData, isLoading } = useListNotifications(
    { limit: 30 },
    {
      query: {
        queryKey: getListNotificationsQueryKey({ limit: 30 }),
        enabled: open,
      },
    } as never,
  );

  const notifications: any[] = (notifData as any)?.data ?? [];

  const markAll = useMarkAllNotificationsRead();
  const markOne = useMarkNotificationRead();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetUnreadNotificationCountQueryKey() });
  };

  // When popover opens, refetch + start faster polling. Stop on close.
  useEffect(() => {
    if (open) {
      invalidate();
      pollRef.current = setInterval(invalidate, 10_000);
    } else {
      if (pollRef.current) clearInterval(pollRef.current);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [open]);

  const onMarkAll = async () => {
    await markAll.mutateAsync({} as never);
    invalidate();
  };

  const onClickNotification = async (n: any) => {
    if (!n.readAt) {
      await markOne.mutateAsync({ id: n.id } as never);
      invalidate();
    }
    if (n.link) {
      setOpen(false);
      setLocation(n.link);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground relative rounded-lg"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full bg-primary text-[10px] font-bold text-primary-foreground flex items-center justify-center px-1 shadow shadow-primary/50">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        className="w-[360px] p-0 shadow-xl border-border/60"
        sideOffset={8}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
          <div className="text-sm font-semibold">
            Уведомления
            {unreadCount > 0 && (
              <Badge className="ml-2 text-[10px] h-4 bg-primary/15 text-primary border-primary/30">
                {unreadCount} новых
              </Badge>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7 text-muted-foreground hover:text-foreground"
              onClick={onMarkAll}
              disabled={markAll.isPending}
            >
              <CheckCheck className="h-3.5 w-3.5 mr-1" />
              Прочитать все
            </Button>
          )}
        </div>

        <ScrollArea className="max-h-[420px]">
          {isLoading ? (
            <div className="p-3 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-md" />
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              <Bell className="h-8 w-8 mx-auto mb-2 opacity-20" />
              Нет уведомлений
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {notifications.map((n) => (
                <button
                  key={n.id}
                  className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors hover:bg-muted/40 ${
                    !n.readAt ? "bg-primary/[0.04]" : ""
                  }`}
                  onClick={() => onClickNotification(n)}
                >
                  <span className="text-base mt-0.5 shrink-0">
                    {TYPE_ICONS[n.type] ?? "🔔"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p
                        className={`text-sm leading-tight ${
                          !n.readAt ? "font-semibold text-foreground" : "text-muted-foreground"
                        }`}
                      >
                        {n.title}
                      </p>
                      {n.link && (
                        <ExternalLink className="h-3 w-3 shrink-0 mt-0.5 text-muted-foreground/50" />
                      )}
                    </div>
                    {n.body && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
                    )}
                    <p className="text-[10px] text-muted-foreground/60 mt-1">{timeAgo(n.createdAt)}</p>
                  </div>
                  {!n.readAt && (
                    <span className="mt-1.5 h-2 w-2 rounded-full bg-primary shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}
        </ScrollArea>

        {notifications.length > 0 && (
          <div className="border-t border-border/50 px-4 py-2 text-center">
            <p className="text-[10px] text-muted-foreground/60">
              Показаны последние {notifications.length} уведомлений
            </p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
