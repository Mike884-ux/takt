import { useEffect, useRef } from "react";
import { loadBook, saveBook } from "@/lib/book-api";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useBook } from "@/store/portfolio";

function score(book: {
  cash: number;
  holdings: { qty: number }[];
  fills: { at: number }[];
}) {
  const newest = book.fills.reduce((max, row) => Math.max(max, row.at || 0), 0);
  return book.holdings.length * 100 + book.fills.length * 10 + (book.cash > 0 ? 1 : 0) + newest / 1e13;
}

export function BookSync() {
  const { user, isPending } = useCurrentUserState();
  const hydrateCloud = useBook((s) => s.hydrateCloud);
  const seen = useRef<string | null>(null);

  useEffect(() => {
    if (isPending || !user) return;
    if (seen.current === user.id) return;
    seen.current = user.id;
    let live = true;
    loadBook()
      .then((cloud) => {
        if (!live) return;
        const local = useBook.getState();
        const localBook = {
          cash: local.cash,
          holdings: local.holdings,
          fills: local.fills,
          risk: local.risk,
          lastDaily: local.lastDaily,
        };
        const keepLocal =
          score(localBook) > score(cloud) ||
          (cloud.empty && (local.holdings.length > 0 || local.fills.length > 0));
        if (keepLocal) {
          hydrateCloud(localBook);
          void saveBook({ data: localBook });
          return;
        }
        hydrateCloud(cloud);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [user, isPending, hydrateCloud]);

  return null;
}
