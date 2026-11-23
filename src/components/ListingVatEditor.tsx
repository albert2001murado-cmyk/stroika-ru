"use client";

import { useEffect, useState } from "react";
import { useAuth } from "./AuthProvider";
import { VatPaymentOption } from "./VatPayment";
import { acceptsVatPayment } from "@/lib/vat";
import { accountRequest } from "@/lib/accountClient";

export default function ListingVatEditor({ listing, onSaved }: {
  listing: { id: string; authorId?: string; acceptsVat?: unknown };
  onSaved: (value: boolean) => void;
}) {
  const { user } = useAuth();
  const [checked, setChecked] = useState(acceptsVatPayment(listing));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => { setChecked(acceptsVatPayment(listing)); }, [listing.id, listing.acceptsVat]);
  if (!user || user.uid !== listing.authorId) return null;
  async function save() {
    if (saving) return;
    setSaving(true); setMessage("");
    try {
      await accountRequest("/api/publications/edit", { kind: "listing", id: listing.id, publication: { acceptsVat: checked } });
      onSaved(checked);
      setMessage("Условие оплаты сохранено. Объявление отправлено на повторную проверку");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не получилось сохранить изменение");
    } finally { setSaving(false); }
  }
  return <section className="my-5 rounded-2xl border border-blue-100 bg-white p-4">
    <h2 className="text-base font-extrabold text-gray-900">Условия оплаты</h2>
    <VatPaymentOption checked={checked} onChange={setChecked} disabled={saving} />
    <button type="button" onClick={() => void save()} disabled={saving || checked === acceptsVatPayment(listing)} className="rounded-xl bg-[#0057ff] px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{saving ? "Сохраняем…" : "Сохранить условие оплаты"}</button>
    {message ? <p role="status" className="mt-3 text-sm text-gray-600">{message}</p> : null}
  </section>;
}
