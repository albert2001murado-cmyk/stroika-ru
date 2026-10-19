import { arrayRemove, arrayUnion, doc, FieldPath, updateDoc } from "firebase/firestore";
import { db } from "./firebase";
import type { Chat } from "./chatList";

export async function setChatPinned(chatId: string, value: Chat["pinnedBy"], uid: string, pinned: boolean) {
  const ref = doc(db, "chats", chatId);
  if (Array.isArray(value)) {
    await updateDoc(ref, { pinnedBy: pinned ? arrayUnion(uid) : arrayRemove(uid) });
  } else {
    // Preserve the map and every other participant's marker under the security rules.
    await updateDoc(ref, new FieldPath("pinnedBy", uid), pinned);
  }
}
