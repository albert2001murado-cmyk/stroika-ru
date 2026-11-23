import { FieldValue as NativeFieldValue, FieldPath as NativeFieldPath } from "firebase-admin/firestore";
import { fieldPath, transform } from "./value";
export * from "firebase-admin/firestore";
export type FieldValue = NativeFieldValue;
export class FieldPath extends NativeFieldPath {
  constructor(...segments: string[]) { super(...segments); fieldPath(this, segments); }
  static documentId() { return new FieldPath("__name__"); }
}
export const FieldValue = {
  serverTimestamp: () => transform(NativeFieldValue.serverTimestamp(), "timestamp"),
  delete: () => transform(NativeFieldValue.delete(), "delete"),
  increment: (n: number) => transform(NativeFieldValue.increment(n), "increment", [n]),
  arrayUnion: (...values: unknown[]) => transform(NativeFieldValue.arrayUnion(...values), "union", values),
  arrayRemove: (...values: unknown[]) => transform(NativeFieldValue.arrayRemove(...values), "remove", values),
};
