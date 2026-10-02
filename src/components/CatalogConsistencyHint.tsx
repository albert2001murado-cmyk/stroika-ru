import { AlertCircle } from "lucide-react";
import { checkCatalogConsistency, type CatalogConsistencyInput } from "@/lib/catalogConsistency";

export default function CatalogConsistencyHint({ value }: { value: CatalogConsistencyInput }) {
  const issue = checkCatalogConsistency(value);
  return issue ? <div role="status" aria-live="polite" className="my-3 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-950">
    <AlertCircle size={20} className="mt-0.5 shrink-0" aria-hidden /><div><p className="font-bold">Проверьте категорию</p><p className="mt-1">{issue.message}</p></div>
  </div> : null;
}
