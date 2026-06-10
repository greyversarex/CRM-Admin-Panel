import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetUnreadNotificationCountQueryKey,
  getListNotificationsQueryKey,
} from "@workspace/api-client-react";

/**
 * Opens a persistent Server-Sent Events connection to /api/notifications/stream.
 *
 * When the server emits a "notification" event (i.e. a new notification was
 * created for the current user), this hook invalidates the react-query caches
 * for the unread-count badge and the notification list — so the UI updates
 * instantly without waiting for the next polling interval.
 *
 * EventSource reconnects automatically on network drops (5 s back-off).
 * The connection is closed when the component unmounts (e.g. on logout).
 */
export function useNotificationStream(): void {
  const queryClient = useQueryClient();
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    let unmounted = false;

    function connect() {
      if (unmounted) return;

      const es = new EventSource("/api/notifications/stream");
      esRef.current = es;

      es.addEventListener("notification", () => {
        void queryClient.invalidateQueries({
          queryKey: getGetUnreadNotificationCountQueryKey(),
        });
        void queryClient.invalidateQueries({
          queryKey: getListNotificationsQueryKey(),
        });
      });

      es.onerror = () => {
        es.close();
        esRef.current = null;
        if (!unmounted) {
          reconnectTimerRef.current = setTimeout(connect, 5_000);
        }
      };
    }

    connect();

    return () => {
      unmounted = true;
      if (reconnectTimerRef.current !== null) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    };
  }, [queryClient]);
}
