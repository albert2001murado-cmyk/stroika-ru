import type { Metadata } from "next";
import LegalDocumentPage from "@/components/LegalDocumentPage";
import { legalDocuments } from "@/legal/documents";

export const metadata: Metadata = { title: "Правила публикации — Стройка.ру" };

export default function Page() {
  return <LegalDocumentPage document={legalDocuments["publication-rules"]} />;
}
