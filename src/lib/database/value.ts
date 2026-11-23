/** Transport/storage values. Strings and map keys are UTF-8/base64 so PostgreSQL
 * jsonb can retain Firestore strings containing U+0000. No credentials live here. */
export type Value = [string, any?];
export type Field = string[];
export type Filter = { field: Field; op: string; value: Value };
export type Order = { field: Field; direction: "asc" | "desc" };
export type Cursor = { values: Value[]; inclusive: boolean };
export type Selection = { path: string; group?: boolean; filters?: Filter[]; orders?: Order[]; limit?: number; start?: Cursor; end?: Cursor; select?: Field[] };
export type Mutation = { path: string; kind: "set" | "update" | "create" | "delete"; value?: Value; fields?: { field: Field; value: Value }[]; merge?: boolean; mergeFields?: Field[]; precondition?: string };
export type RecordValue = { path: string; value: Value | null; version: string };
export type Factories = {
  timestamp: (seconds: number, nanos: number) => any;
  bytes: (bytes: Uint8Array) => any;
  reference: (path: string) => any;
  geopoint: (latitude: number, longitude: number) => any;
};
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
export function base64(bytes: Uint8Array): string {
  let result = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0);
    result += alphabet[n >>> 18] + alphabet[(n >>> 12) & 63] + (i + 1 < bytes.length ? alphabet[(n >>> 6) & 63] : "=") + (i + 2 < bytes.length ? alphabet[n & 63] : "=");
  }
  return result;
}
export function unbase64(value: string): Uint8Array {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new Error("Invalid base64");
  const result: number[] = [];
  let bits = 0, buffer = 0;
  for (const char of value.replace(/=+$/, "")) {
    buffer = (buffer << 6) | alphabet.indexOf(char); bits += 6;
    if (bits >= 8) { bits -= 8; result.push((buffer >>> bits) & 255); }
  }
  return new Uint8Array(result);
}
export function encodeString(value: string): string {
  // No Buffer dependency: the same codec runs in Hermes and in Node.
  const bytes: number[] = [];
  for (const character of value) {
    let c = character.codePointAt(0)!;
    if (c >= 0xd800 && c <= 0xdfff) c = 0xfffd;
    if (c < 128) bytes.push(c);
    else if (c < 2048) bytes.push(192 | c >> 6, 128 | c & 63);
    else if (c < 65536) bytes.push(224 | c >> 12, 128 | c >> 6 & 63, 128 | c & 63);
    else bytes.push(240 | c >> 18, 128 | c >> 12 & 63, 128 | c >> 6 & 63, 128 | c & 63);
  }
  return base64(new Uint8Array(bytes));
}
export function decodeString(value: string): string {
  return decodeURIComponent(Array.from(unbase64(value), byte => "%" + byte.toString(16).padStart(2, "0")).join(""));
}
// Next instrumentation and route handlers may load separate module graphs while
// sharing a process-wide pool/database instance. Sentinels must cross that boundary.
const shared = globalThis as typeof globalThis & { __strovaDatabaseValuesV1?: { transforms: WeakMap<object,Value>; paths: WeakMap<object,Field> } };
const registry = shared.__strovaDatabaseValuesV1 ||= {transforms:new WeakMap(),paths:new WeakMap()};
const {transforms,paths} = registry;
export function transform<T extends object>(target: T, name: string, values: unknown[] = []): T {
  transforms.set(target, ["x", [name, values.map(encode)]]); return target;
}
export function fieldPath<T extends object>(target: T, segments: string[]): T { paths.set(target, segments); return target; }
export function fieldSegments(field: string | object): Field {
  if (typeof field === "string") return field.split(".");
  const saved = paths.get(field);
  if (!saved) throw new Error("Unsupported field path");
  return saved;
}
export function encode(value: any): Value {
  if (value === null) return ["z"];
  if (value === undefined) throw new Error("Undefined database field");
  if (typeof value === "boolean") return ["b", value];
  if (typeof value === "number") return ["n", Number.isNaN(value) ? "NaN" : Object.is(value, -0) ? "-0" : String(value)];
  if (typeof value === "string") return ["s", encodeString(value)];
  if (typeof value !== "object") throw new Error("Unsupported database field");
  const sentinel = transforms.get(value); if (sentinel) return sentinel;
  if (value instanceof Date) {
    const ms = value.getTime(); if (!Number.isFinite(ms)) throw new Error("Invalid date");
    const seconds = Math.floor(ms / 1000); return ["t", [seconds, (ms - seconds * 1000) * 1e6]];
  }
  if (typeof value.seconds === "number" && typeof value.nanoseconds === "number" && typeof value.toDate === "function") return ["t", [value.seconds, value.nanoseconds]];
  if (value instanceof Uint8Array) return ["y", base64(value)];
  if (typeof value.toUint8Array === "function") return ["y", base64(value.toUint8Array())];
  if (typeof value.path === "string" && (value.firestore || value._firestore)) return ["r", value.path.split("/").map(encodeString)];
  if (typeof value.latitude === "number" && typeof value.longitude === "number") return ["g", [value.latitude, value.longitude]];
  if (Array.isArray(value)) return ["a", value.map(encode)];
  const result: Record<string, Value> = Object.create(null);
  for (const key of Object.keys(value)) result[encodeString(key)] = encode(value[key]);
  return ["m", result];
}
export function decode(value: Value, factory: Factories): any {
  switch (value[0]) {
    case "z": return null;
    case "b": return value[1];
    case "n": return Number(value[1]);
    case "s": return decodeString(value[1]);
    case "t": return factory.timestamp(value[1][0], value[1][1]);
    case "y": return factory.bytes(unbase64(value[1]));
    case "r": return factory.reference(value[1].map(decodeString).join("/"));
    case "g": return factory.geopoint(value[1][0], value[1][1]);
    case "a": return value[1].map((item: Value) => decode(item, factory));
    case "m": {
      const result: Record<string, any> = {};
      for (const key of Object.keys(value[1])) Object.defineProperty(result, decodeString(key), { value: decode(value[1][key], factory), enumerable: true, writable: true, configurable: true });
      return result;
    }
    default: throw new Error("Invalid database value");
  }
}
export function getField(value: Value | null, field: Field): Value | undefined {
  let current: Value | undefined = value || undefined;
  for (const part of field) current = current?.[0] === "m" ? current[1][encodeString(part)] : undefined;
  return current;
}
export function putField(root: Value, path: Field, value?: Value) {
  if (!path.length || path.some(p => !p)) throw new Error("Invalid field path");
  let current = root;
  for (const part of path.slice(0, -1)) {
    const key = encodeString(part);
    if (current[1][key]?.[0] !== "m") current[1][key] = ["m", Object.create(null)];
    current = current[1][key];
  }
  const key = encodeString(path[path.length - 1]);
  if (value === undefined) delete current[1][key]; else current[1][key] = value;
}
export function equal(a: Value | undefined | null, b: Value | undefined | null): boolean {
  if (!a || !b) return a === b;
  if (a[0] !== b[0]) return false;
  if (a[0] === "m") {
    const keys = Object.keys(a[1]);
    return keys.length === Object.keys(b[1]).length && keys.every(key => equal(a[1][key], b[1][key]));
  }
  if (a[0] === "n") return numericKey(a[1]) === numericKey(b[1]);
  if (a[0] === "a") return a[1].length === b[1].length && a[1].every((v: Value, i: number) => equal(v, b[1][i]));
  return JSON.stringify(a) === JSON.stringify(b);
}
function numericKey(value: string) {
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(value);
  if (!match) return value;
  let digits = (match[2]+(match[3] || "")).replace(/^0+/,"");
  if (!digits) return "0";
  let exponent = Number(match[4] || 0)-(match[3]?.length || 0);
  while (digits.endsWith("0")) { digits = digits.slice(0,-1); exponent++; }
  return `${match[1]}${digits}e${exponent}`;
}
export function validPath(path: unknown, document: boolean): asserts path is string {
  if (typeof path !== "string" || path.length > 6144 || path.includes("\0")) throw new Error("Invalid database path");
  const parts = path.split("/");
  if (!parts.length || (parts.length % 2 === 0) !== document || parts.some(part => !part || part === "." || part === ".." || encodeString(part).length > 2000)) throw new Error("Invalid database path");
}
/** Validate untrusted transport before evaluating policies or touching SQL. */
export function validateValue(value: any, transformsAllowed = false, depth = 0): asserts value is Value {
  if (depth > 32 || !Array.isArray(value) || value.length < 1 || value.length > 2) throw new Error("Invalid value");
  const [kind, data] = value;
  if (kind === "z" && value.length === 1) return;
  if (kind === "b" && typeof data === "boolean") return;
  if (kind === "n" && typeof data === "string" && (/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(data) && Number.isFinite(Number(data)) || ["NaN", "Infinity", "-Infinity"].includes(data)) && data.length < 400) return;
  if (["s", "y"].includes(kind) && typeof data === "string") { unbase64(data); if (kind === "s") decodeString(data); return; }
  if (kind === "t" && Array.isArray(data) && data.length === 2 && Number.isInteger(data[0]) && data[0] >= -62135596800 && data[0] <= 253402300799 && Number.isInteger(data[1]) && data[1] >= 0 && data[1] < 1e9) return;
  if (kind === "g" && Array.isArray(data) && data.length === 2 && Number.isFinite(data[0]) && Math.abs(data[0]) <= 90 && Number.isFinite(data[1]) && Math.abs(data[1]) <= 180) return;
  if (kind === "r" && Array.isArray(data) && data.every(x => typeof x === "string")) { validPath(data.map(decodeString).join("/"), true); return; }
  if (kind === "a" && Array.isArray(data)) { data.forEach(x => validateValue(x, transformsAllowed, depth + 1)); return; }
  if (kind === "m" && data && typeof data === "object" && !Array.isArray(data)) { for (const key of Object.keys(data)) { decodeString(key); validateValue(data[key], transformsAllowed, depth + 1); } return; }
  if (kind === "x" && transformsAllowed && Array.isArray(data) && data.length === 2 && ["timestamp", "delete", "increment", "union", "remove"].includes(data[0]) && Array.isArray(data[1])) { data[1].forEach((x: Value) => validateValue(x, false, depth + 1)); if (["timestamp", "delete"].includes(data[0]) && data[1].length || data[0] === "increment" && (data[1].length !== 1 || data[1][0][0] !== "n")) throw new Error("Invalid transform"); return; }
  throw new Error("Invalid database value");
}
