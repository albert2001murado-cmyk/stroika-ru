import { decodeString, encodeString, equal, getField, putField, type Mutation, type Value } from "./value";
export class DatabaseError extends Error {
  constructor(public code: string | number, message: string, public status = 400) { super(message); }
}
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)); }
function resolve(value: Value, before: Value | undefined, now: Value): Value | undefined {
  if (value[0] === "x") {
    const [op, args] = value[1] as [string, Value[]];
    if (op === "delete") return undefined;
    if (op === "timestamp") return clone(now);
    if (op === "increment") {
      if (before?.[0] !== "n") return clone(args[0]);
      const x = before[1], y = args[0][1];
      if (/^-?\d+$/.test(x) && /^-?\d+$/.test(y)) {
        let n = BigInt(x) + BigInt(y); const min = BigInt("-9223372036854775808"), max = BigInt("9223372036854775807");
        if (n < min) n = min; if (n > max) n = max;
        return ["n", String(n)];
      }
      return ["n", String(Number(x) + Number(y))];
    }
    const list: Value[] = before?.[0] === "a" ? clone(before[1]) : [];
    if (op === "union") { for (const item of args) if (!list.some(old => equal(old, item))) list.push(clone(item)); return ["a", list]; }
    if (op === "remove") return ["a", list.filter(old => !args.some(item => equal(old, item)))];
    throw new DatabaseError("invalid-argument", "Неизвестное преобразование поля.");
  }
  if (value[0] === "m") {
    const result: Record<string, Value> = Object.create(null);
    for (const key of Object.keys(value[1])) {
      const resolved = resolve(value[1][key], before?.[0] === "m" ? before[1][key] : undefined, now);
      if (resolved !== undefined) result[key] = resolved;
    }
    return ["m", result];
  }
  if (value[0] === "a") {
    if (value[1].some((item: Value) => item[0] === "x")) throw new DatabaseError("invalid-argument", "Преобразование внутри массива недопустимо.");
  }
  return clone(value);
}
export function applyMutation(before: Value | null, mutation: Mutation, now: Value): Value | null {
  if (mutation.kind === "delete") return null;
  if (mutation.kind === "create" && before) throw new DatabaseError(6, "Документ уже существует.", 409);
  if (mutation.kind === "update" && !before) throw new DatabaseError(5, "Документ не найден.", 404);
  if (mutation.kind === "update") {
    const result = clone(before!);
    const fields = mutation.fields || [];
    const seen: string[][] = [];
    for (const item of fields) {
      if (seen.some(path => path.slice(0, Math.min(path.length, item.field.length)).every((v, i) => v === item.field[i]))) throw new DatabaseError("invalid-argument", "Поля обновления пересекаются.");
      seen.push(item.field);
      putField(result, item.field, resolve(item.value, getField(before, item.field), now));
    }
    return result;
  }
  if (mutation.value?.[0] !== "m") throw new DatabaseError("invalid-argument", "Ожидался объект.");
  if (mutation.mergeFields) {
    const result: Value = clone(before || ["m", {}] as Value);
    for (const field of mutation.mergeFields) {
      const value = getField(mutation.value, field);
      if (!value) throw new DatabaseError("invalid-argument", "Поле объединения отсутствует.");
      putField(result, field, resolve(value, getField(before, field), now));
    }
    return result;
  }
  if (!mutation.merge) return resolve(mutation.value, before || undefined, now)!;
  const result: Value = clone(before || ["m", {}] as Value);
  function merge(value: Value, prefix: string[]) {
    if (value[0] === "m" && Object.keys(value[1]).length) {
      for (const key of Object.keys(value[1])) merge(value[1][key], [...prefix, decodeString(key)]);
    } else putField(result, prefix, resolve(value, getField(before, prefix), now));
  }
  for (const key of Object.keys(mutation.value[1])) merge(mutation.value[1][key], [decodeString(key)]);
  return result;
}
export function mutationFromData(path: string, kind: Mutation["kind"], value: Value, options: { merge?: boolean; mergeFields?: string[][] } = {}): Mutation {
  if (kind !== "update") return { path, kind, value, ...options };
  return { path, kind, fields: Object.keys(value[1]).map(key => ({ field: decodeString(key).split("."), value: value[1][key] })) };
}
