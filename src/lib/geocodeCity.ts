// Compatibility with servers that return a formatted address without a city field.
export function cityFromAddress(address: unknown): string {
  if (typeof address !== "string") return "";
  const parts = address.split(",").map(part => part.trim()).filter(Boolean);
  const administrative = /(?:область|край|республика|район|округ|поселение|россия|российская федерация)/i;
  const street = /(?:улица|проспект|переулок|шоссе|проезд|набережная|площадь|бульвар|тупик|километр|квартал|микрорайон|территория|снт|днп|дорога|кремль)/i;
  const prefix = /^(?:г\.?|город|деревня|село|посёлок|поселок|пгт|станица)\s+/i;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (prefix.test(part)) return part.replace(prefix, "");
    // Only infer an unlabelled city following a country/region, never a bare street.
    if (i > 0 && administrative.test(parts[i - 1]) && !administrative.test(part) && !street.test(part) && !/\d/.test(part)) return part;
  }
  return "";
}
