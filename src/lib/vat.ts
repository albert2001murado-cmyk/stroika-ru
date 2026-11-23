/** Explicit author choice; legacy documents and strings never imply VAT support. */
export const VAT_PAYMENT_LABEL = "Оплата с НДС";
export type VatPublication = { acceptsVat?: unknown };
export function acceptsVatPayment(publication: unknown): boolean {
  return !!publication && typeof publication === "object" && (publication as VatPublication).acceptsVat === true;
}
export function matchesVatPayment(publication: unknown, onlyVat: boolean): boolean {
  return !onlyVat || acceptsVatPayment(publication);
}
