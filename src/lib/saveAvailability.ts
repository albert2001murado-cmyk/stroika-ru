import { doc, serverTimestamp, writeBatch } from "firebase/firestore";
import { auth, db } from "./firebase";
import { CALENDAR_STATUSES, calendarDate, type CalendarStatus } from "./availability-calendar";

/** One atomic calendar update; no listing, profile or permission fields are touched. */
export async function saveAvailabilityDates(uid: string, selected: readonly string[], status: CalendarStatus | null) {
  if (!uid || auth.currentUser?.uid !== uid) throw new Error("Войдите в свой аккаунт, чтобы изменить календарь.");
  const dates = [...new Set(selected)];
  if (!dates.length || dates.length > 31 || dates.some(key => !calendarDate(key))) throw new Error("Выберите даты в календаре.");
  if (status !== null && !CALENDAR_STATUSES.includes(status)) throw new Error("Выберите статус дня.");
  const batch = writeBatch(db);
  batch.set(doc(db, "availability", uid), { userId: uid, updatedAt: serverTimestamp() }, { merge: true });
  for (const date of dates) {
    const ref = doc(db, "availability", uid, "days", date);
    if (status === null) batch.delete(ref);
    else batch.set(ref, { userId: uid, date, status, updatedAt: serverTimestamp() }, { merge: true });
  }
  await batch.commit();
}
