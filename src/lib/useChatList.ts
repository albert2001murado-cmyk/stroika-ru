"use client";

import { useEffect, useState } from "react";
import { collection, FieldPath, onSnapshot, query, where } from "firebase/firestore";
import { db } from "./firebase";
import type { Chat } from "./chatList";

type State = { ownerId: string; chats: Chat[]; loading: boolean; error: string };

export function useChatList(uid: string, reloadKey = 0) {
  const [state, setState] = useState<State>({ ownerId: "", chats: [], loading: true, error: "" });
  useEffect(() => {
    if (!uid) {
      setState({ ownerId: "", chats: [], loading: false, error: "" });
      return;
    }
    setState({ ownerId: uid, chats: [], loading: true, error: "" });
    const chatsCollection = collection(db, "chats");
    const sources = [
      {
        key: "participantIds",
        value: query(
          chatsCollection,
          where("participantIds", "array-contains", uid)
        ),
      },
      {
        key: "participantsList",
        value: query(
          chatsCollection,
          where("participants", "array-contains", uid)
        ),
      },
      {
        key: "participantsMap",
        value: query(
          chatsCollection,
          where(new FieldPath("participants", uid, "uid"), "==", uid)
        ),
      },
      {
        key: "usersMap",
        value: query(
          chatsCollection,
          where(new FieldPath("users", uid, "uid"), "==", uid)
        ),
      },
      {
        key: "usersList",
        value: query(
          chatsCollection,
          where("users", "array-contains", uid)
        ),
      },
      {
        key: "buyerId",
        value: query(chatsCollection, where("buyerId", "==", uid)),
      },
      {
        key: "sellerId",
        value: query(chatsCollection, where("sellerId", "==", uid)),
      },
      {
        key: "clientId",
        value: query(chatsCollection, where("clientId", "==", uid)),
      },
      {
        key: "customerId",
        value: query(chatsCollection, where("customerId", "==", uid)),
      },
      {
        key: "contractorId",
        value: query(chatsCollection, where("contractorId", "==", uid)),
      },
      {
        key: "authorId",
        value: query(chatsCollection, where("authorId", "==", uid)),
      },
      {
        key: "ownerId",
        value: query(chatsCollection, where("ownerId", "==", uid)),
      },
    ];

    const resultBySource = new Map<string, Map<string, Chat>>();
    const settledSources = new Set<string>();
    const failedSources = new Set<string>();
    let disposed = false;

    function publishMergedChats() {
      if (disposed) return;

      const merged = new Map<string, Chat>();
      // Prefer the canonical membership query when a chat is returned by several sources.
      for (const source of sources) {
        resultBySource.get(source.key)?.forEach((chat, id) => {
          if (!merged.has(id)) merged.set(id, chat);
        });
      }

      setState({ ownerId: uid, chats: Array.from(merged.values()), loading: settledSources.size !== sources.length, error: failedSources.size === sources.length ? "Не удалось загрузить чаты. Попробуйте ещё раз." : "" });

    }

    const unsubscribes = sources.map((source) =>
      onSnapshot(
        source.value,
        (snapshot) => {
          const sourceChats = new Map<string, Chat>();
          snapshot.docs.forEach((item) => {
            sourceChats.set(item.id, {
              id: item.id,
              ...item.data(),
            } as Chat);
          });

          resultBySource.set(source.key, sourceChats);
          settledSources.add(source.key);
          failedSources.delete(source.key);
          publishMergedChats();
        },
        (snapshotError) => {
          console.error(
            `[messages] Firestore query failed (${source.key})`,
            snapshotError
          );
          resultBySource.set(source.key, new Map());
          settledSources.add(source.key);
          failedSources.add(source.key);
          publishMergedChats();
        }
      )
    );

    return () => {
      disposed = true;
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, [uid, reloadKey]);
  return state.ownerId === uid ? state : { ownerId: uid, chats: [], loading: Boolean(uid), error: "" };
}
