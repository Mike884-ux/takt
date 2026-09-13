import { useEffect, useRef } from "react";
import { maybeAutoBackup } from "@/lib/backup-api";
import { loadHistory, saveHistory } from "@/lib/history-api";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { bootDeskFromLocal, useDesk } from "@/store/desk";

export function HistorySync() {
  const { user, isPending } = useCurrentUserState();
  const hydrate = useDesk((s) => s.hydrate);
  const messages = useDesk((s) => s.messages);
  const last = useDesk((s) => s.last);
  const interval = useDesk((s) => s.interval);
  const hydrated = useDesk((s) => s.hydrated);
  const seen = useRef<string | null>(null);
  const timer = useRef<number>(0);

  useEffect(() => {
    bootDeskFromLocal();
  }, []);

  useEffect(() => {
    if (isPending || !user) return;
    if (seen.current === user.id) return;
    seen.current = user.id;
    let live = true;
    loadHistory()
      .then((cloud) => {
        if (!live) return;
        const local = useDesk.getState();
        if (cloud.empty && local.messages.length) {
          hydrate({
            interval: local.interval,
            messages: local.messages,
            last: local.last,
          });
          void saveHistory({
            data: {
              interval: local.interval,
              messages: local.messages,
              last: local.last,
            },
          });
          return;
        }
        if (!cloud.empty) {
          hydrate({
            interval: cloud.interval,
            messages: cloud.messages,
            last: cloud.last,
          });
          return;
        }
        hydrate({
          interval: local.interval,
          messages: local.messages,
          last: local.last,
        });
      })
      .catch(() => {
        const local = useDesk.getState();
        hydrate({
          interval: local.interval,
          messages: local.messages,
          last: local.last,
        });
      })
      .finally(() => {
        if (!live) return;
        void maybeAutoBackup().catch(() => undefined);
      });
    return () => {
      live = false;
    };
  }, [user, isPending, hydrate]);

  useEffect(() => {
    if (!user || !hydrated) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      void saveHistory({
        data: { interval, messages, last },
      }).catch(() => undefined);
    }, 800);
    return () => window.clearTimeout(timer.current);
  }, [user, hydrated, interval, messages, last]);

  return null;
}
