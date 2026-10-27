import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import type {
  VerificationRequest,
  VerificationStatus,
} from "./accountVerification";
import { verificationApi } from "./verificationClient";

export function useVerificationQueue(
  user: User | null,
  endpoint: string,
  enabled = true,
) {
  const [status, setStatus] = useState<VerificationStatus>("pending");
  const [items, setItems] = useState<VerificationRequest[]>([]),
    [cursor, setCursor] = useState("");
  const [owner, setOwner] = useState(""),
    [loading, setLoading] = useState(true),
    [more, setMore] = useState(false);
  const [error, setError] = useState(""),
    [working, setWorking] = useState(false);
  const [selected, setSelected] = useState<VerificationRequest | null>(null),
    [comment, setComment] = useState("");
  const generation = useRef(0),
    busy = useRef(false),
    loadingMore = useRef(false);
  const load = useCallback(
    async (after = "") => {
      if (busy.current) return;
      if (!user || !enabled || (after && loadingMore.current)) {
        if (!user || !enabled) setLoading(false);
        return;
      }
      const current = after ? generation.current : ++generation.current;
      if (after) {
        loadingMore.current = true;
        setMore(true);
      } else {
        setLoading(true);
        setItems([]);
        setCursor("");
      }
      setError("");
      try {
        const page = await verificationApi<{
          items: VerificationRequest[];
          nextCursor: string;
        }>(
          user,
          `${endpoint}?status=${status}${after ? `&after=${encodeURIComponent(after)}` : ""}`,
        );
        if (current !== generation.current) return;
        setOwner(user.uid);
        setItems((previous) =>
          after
            ? [
                ...new Map(
                  [...previous, ...page.items].map((item) => [item.id, item]),
                ).values(),
              ]
            : page.items,
        );
        setCursor(page.nextCursor);
      } catch (failure) {
        if (current === generation.current)
          setError(
            failure instanceof Error
              ? failure.message
              : "Не удалось загрузить заявки.",
          );
      } finally {
        if (current === generation.current) {
          setLoading(false);
          setMore(false);
          loadingMore.current = false;
        }
      }
    },
    [user?.uid, enabled, endpoint, status],
  );
  useEffect(() => {
    setItems([]);
    setSelected(null);
    setComment("");
    setOwner("");
    busy.current = false;
    loadingMore.current = false;
    setWorking(false);
    void load();
    return () => {
      generation.current++;
    };
  }, [load]);
  const select = (item: VerificationRequest | null) => {
    if (busy.current) return;
    setSelected(item);
    setComment("");
    setError("");
  };
  async function review(decision: "approved" | "rejected") {
    if (!user || !enabled || !selected || busy.current) return;
    if (decision === "rejected" && comment.trim().length < 5) {
      setError("Напишите причину отказа — минимум 5 символов.");
      return;
    }
    busy.current = true;
    setWorking(true);
    setError("");
    const current = generation.current;
    try {
      await verificationApi(user, endpoint, {
        requestId: selected.id,
        status: decision,
        comment,
      });
      if (current !== generation.current) return;
      setItems((previous) =>
        previous.filter((item) => item.id !== selected.id),
      );
      setSelected(null);
      setComment("");
    } catch (failure) {
      if (current === generation.current)
        setError(
          failure instanceof Error
            ? failure.message
            : "Не удалось сохранить решение.",
        );
    } finally {
      if (current === generation.current) {
        busy.current = false;
        setWorking(false);
      }
    }
  }
  const visible = owner === user?.uid && enabled;
  return {
    status,
    setStatus,
    items: visible ? items : [],
    cursor: visible ? cursor : "",
    selected: visible ? selected : null,
    select,
    comment,
    setComment,
    loading,
    more,
    working,
    error,
    refresh: () => load(),
    loadMore: () => (cursor ? load(cursor) : Promise.resolve()),
    review,
  };
}
