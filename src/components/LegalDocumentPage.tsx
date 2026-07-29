import Link from "next/link";
import { LEGAL_PLACEHOLDER_NOTICE, type LegalDocument } from "@/legal/documents";

export default function LegalDocumentPage({ document }: { document: LegalDocument }) {
  return (
    <main className="min-h-screen bg-[#f5f8ff] px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-5xl overflow-hidden rounded-[34px] bg-white shadow-xl shadow-blue-950/10 ring-1 ring-slate-100">
        <header className="bg-[#0057ff] px-6 py-10 text-white sm:px-10 sm:py-14">
          <Link href="/" className="inline-flex items-center gap-3 font-black text-white">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-xl text-[#0057ff]">С</span>
            <span className="text-2xl">Стройка.ру</span>
          </Link>
          <h1 className="mt-8 max-w-4xl text-4xl font-black leading-tight tracking-tight sm:text-6xl">{document.title}</h1>
          <p className="mt-5 max-w-3xl text-base font-bold leading-7 text-blue-100">{document.description}</p>
          <p className="mt-4 text-sm font-black text-[#ffd43b]">Дата вступления в силу: {document.effectiveDate}</p>
        </header>

        <article className="space-y-10 px-6 py-10 sm:px-10 sm:py-12">
          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm font-bold leading-6 text-amber-900">
            {LEGAL_PLACEHOLDER_NOTICE}
          </div>

          {document.sections.map((section) => (
            <section key={section.title} className="border-t border-slate-100 pt-8 first:border-0 first:pt-0">
              <h2 className="text-2xl font-black tracking-tight text-slate-950">{section.title}</h2>
              <div className="mt-4 space-y-4 text-[15px] font-medium leading-7 text-slate-600">
                {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                {section.items?.length ? (
                  <ul className="list-disc space-y-2 pl-6">
                    {section.items.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                ) : null}
              </div>
            </section>
          ))}

          <nav className="grid gap-3 border-t border-slate-100 pt-8 sm:grid-cols-2 lg:grid-cols-4">
            <Link href="/terms" className="rounded-2xl bg-blue-50 px-4 py-3 text-center text-sm font-black text-[#0057ff]">Соглашение</Link>
            <Link href="/platform-rules" className="rounded-2xl bg-blue-50 px-4 py-3 text-center text-sm font-black text-[#0057ff]">Правила платформы</Link>
            <Link href="/publication-rules" className="rounded-2xl bg-blue-50 px-4 py-3 text-center text-sm font-black text-[#0057ff]">Правила публикации</Link>
            <Link href="/privacy" className="rounded-2xl bg-blue-50 px-4 py-3 text-center text-sm font-black text-[#0057ff]">Конфиденциальность</Link>
          </nav>
        </article>
      </div>
    </main>
  );
}
