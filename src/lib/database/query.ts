import { createHash } from "node:crypto";
import { encodeString, validateValue, validPath, type Cursor, type Selection, type Value, type Field } from "./value";
import { DatabaseError } from "./mutations";
export const hash = (value: string) => createHash("sha256").update(value).digest();
export function normalizedOrders(selection: Selection) {
  const orders = [...(selection.orders || [])];
  // Firestore adds inequality fields, then document name, to the ordering.
  const inequality = (selection.filters || []).filter(f => ["<", "<=", ">", ">=", "!=", "not-in"].includes(f.op)).map(f => f.field);
  for (const field of inequality.sort((a, b) => a.join(".").localeCompare(b.join(".")))) if (!orders.some(o => JSON.stringify(o.field) === JSON.stringify(field))) orders.push({ field, direction: orders.at(-1)?.direction || "asc" });
  if (!orders.some(o => o.field.length === 1 && o.field[0] === "__name__")) orders.push({ field: ["__name__"], direction: orders.at(-1)?.direction || "asc" });
  return orders;
}
export function validateSelection(selection: Selection, publicRequest = false) {
  validPath(selection.path, false);
  if (selection.group && selection.path.includes("/")) throw new DatabaseError("invalid-argument", "Некорректная коллекция.");
  if ((selection.filters?.length || 0) > 20 || (selection.orders?.length || 0) > 10 || selection.limit !== undefined && (!Number.isInteger(selection.limit) || selection.limit < 1 || selection.limit > (publicRequest ? 20000 : 100000))) throw new DatabaseError("invalid-argument", "Некорректный запрос.");
  const fields: Field[] = [];
  for (const filter of selection.filters || []) {
    if (!["==", "!=", "<", "<=", ">", ">=", "in", "not-in", "array-contains", "array-contains-any"].includes(filter.op)) throw new DatabaseError("invalid-argument", "Некорректное условие.");
    fields.push(filter.field); validateValue(filter.value);
    if (["in", "not-in", "array-contains-any"].includes(filter.op) && (filter.value[0] !== "a" || !filter.value[1].length || filter.value[1].length > 30)) throw new DatabaseError("invalid-argument", "Некорректный список условий.");
  }
  for (const order of selection.orders || []) { fields.push(order.field); if (!["asc", "desc"].includes(order.direction)) throw new DatabaseError("invalid-argument", "Некорректная сортировка."); }
  fields.push(...(selection.select || []));
  for (const field of fields) if (!Array.isArray(field) || !field.length || field.length > 20 || field.some(p => typeof p !== "string" || !p || p.length > 1500)) throw new DatabaseError("invalid-argument", "Некорректное поле.");
  for (const cursor of [selection.start, selection.end]) if (cursor) {
    if (!Array.isArray(cursor.values) || !cursor.values.length || cursor.values.length > normalizedOrders(selection).length || typeof cursor.inclusive !== "boolean") throw new DatabaseError("invalid-argument", "Некорректный курсор.");
    cursor.values.forEach(v => validateValue(v));
  }
}
export function compileQuery(selection: Selection) {
  validateSelection(selection);
  const values: any[] = [];
  const param = (v: any, cast = "") => { values.push(v); return `$${values.length}${cast}`; };
  const fieldExpr = (field: Field) => field.length === 1 && field[0] === "__name__"
    ? "jsonb_build_array('r',to_jsonb(ARRAY(SELECT replace(encode(convert_to(p,'UTF8'),'base64'),E'\\n','') FROM unnest(string_to_array(d.path,'/')) p)))"
    : `strova_data.field(d.body,${param(field, "::text[]")})`;
  const compare = (field: string, op: string, value: Value) => `${field} OPERATOR(strova_data.${op}) ${param(JSON.stringify(value), "::jsonb")}`;
  const where = ["d.body IS NOT NULL", selection.group ? `d.collection_id=${param(selection.path)}` : `d.collection_key=${param(hash(selection.path))} AND d.collection_path=${param(selection.path)}`];
  for (const filter of selection.filters || []) {
    const expr = fieldExpr(filter.field);
    const value = filter.field[0] === "__name__" ? normalizeName(filter.value, selection) : filter.value;
    where.push(`${expr} IS NOT NULL`);
    if (["in", "not-in"].includes(filter.op)) {
      const options: Value[] = value[1];
      if (filter.op === "not-in" && options.some(v => v[0] === "z")) { where.push("false"); continue; }
      const exprs = options.map(item => compare(expr, "=", filter.field[0] === "__name__" ? normalizeName(item, selection) : item));
      where.push(`${filter.op === "not-in" ? "NOT " : ""}(${exprs.join(" OR ")})`);
    } else if (filter.op === "array-contains" || filter.op === "array-contains-any") {
      const options: Value[] = filter.op === "array-contains" ? [value] : value[1];
      where.push(`(${expr}->>0='a' AND EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN ${expr}->>0='a' THEN ${expr}->1 ELSE '[]'::jsonb END) elem WHERE ${options.map(v => compare("elem", "=", v)).join(" OR ")}))`);
    } else if (filter.op === "!=") where.push(`NOT (${compare(expr, "=", value)})`);
    else {
      if (["<","<=",">",">="].includes(filter.op)) where.push(`${expr}->>0=${param(value[0])}`);
      where.push(compare(expr, filter.op === "==" ? "=" : filter.op, value));
    }
    if ((filter.op === "==" || filter.op === "array-contains") && value[0] === "s" && filter.field[0] !== "__name__") {
      let indexed: Value = filter.op === "array-contains" ? ["a",[value]] : value;
      for (const part of [...filter.field].reverse()) indexed = ["m",{[encodeString(part)]:indexed}];
      where.push(`d.body @> ${param(JSON.stringify(indexed),"::jsonb")}`);
    }
    // Let PostgreSQL use the bounded owner indexes for ordinary equality reads.
    if (filter.op === "==" && JSON.stringify(value).length < 1500 && ["authorId", "userId", "customerId"].includes(filter.field[0]) && filter.field.length === 1) where.push(`octet_length(${expr}::text)<1600`);
  }
  const orders = normalizedOrders(selection);
  const expressions = orders.map(order => fieldExpr(order.field));
  for (const expr of expressions) where.push(`${expr} IS NOT NULL`);
  function cursorWhere(cursor: Cursor, start: boolean) {
    const branches: string[] = [];
    const prefix: string[] = [];
    cursor.values.forEach((raw, i) => {
      const value = orders[i].field[0] === "__name__" ? normalizeName(raw, selection) : raw;
      const last = i === cursor.values.length - 1;
      const asc = orders[i].direction === "asc";
      const op = start === asc ? ">" : "<";
      branches.push(`(${[...prefix, compare(expressions[i], op + (last && cursor.inclusive ? "=" : ""), value)].join(" AND ")})`);
      if (!last) prefix.push(compare(expressions[i], "=", value));
    });
    return `(${branches.join(" OR ")})`;
  }
  if (selection.start) where.push(cursorWhere(selection.start, true));
  if (selection.end) where.push(cursorWhere(selection.end, false));
  const order = expressions.map((expr, i) => `${expr} USING OPERATOR(strova_data.${orders[i].direction === "asc" ? "<" : ">"})`).join(",");
  return { text: `SELECT d.path,d.body,d.version::text,d.updated_at FROM strova_data.documents d WHERE ${where.join(" AND ")} ORDER BY ${order}${selection.limit ? ` LIMIT ${param(selection.limit)}` : ""}`, values };
}
function normalizeName(value: Value, selection: Selection): Value {
  if (value[0] === "a") return ["a", value[1].map((item: Value) => normalizeName(item, selection))];
  if (value[0] === "r") return value;
  if (value[0] === "s") {
    // IDs without slash are relative to a collection; group cursors require a full path.
    const name = Buffer.from(value[1], "base64").toString("utf8");
    const path = name.includes("/") ? name : `${selection.path}/${name}`;
    validPath(path, true); return ["r", path.split("/").map(encodeString)];
  }
  throw new DatabaseError("invalid-argument", "Некорректный идентификатор курсора.");
}
