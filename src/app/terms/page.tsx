import type { Metadata } from "next";
import LegalDocumentPage from "@/components/LegalDocumentPage";
import { legalDocuments } from "@/legal/documents";

export const metadata: Metadata = { title: "Пользовательское соглашение — Стройка.ру" };

export default function Page() {
  return <LegalDocumentPage document={legalDocuments["terms"]} />;
}
