"use client";
import { useState, type ChangeEvent } from "react";
import {
  FileText,
  Loader2,
  Paperclip,
  Trash2,
  LockKeyhole,
} from "lucide-react";
import { useAuth } from "./AuthProvider";
import { getApiUrl } from "@/lib/getApiUrl";
import { verificationFileRequest } from "@/lib/verificationFilesClient";
import {
  VERIFICATION_FILE_ACCEPT,
  VERIFICATION_FILE_LIMIT,
  VERIFICATION_MAX_FILES,
  verificationAttachmentLabel,
  type VerificationAccountType,
  type VerificationAttachment,
  type VerificationAttachmentKind,
} from "@/lib/accountVerification";

export default function VerificationAttachments({
  files = [],
  accountType = "individual",
  onChange,
  disabled = false,
  onBusyChange,
}: {
  files?: VerificationAttachment[];
  accountType?: VerificationAccountType;
  onChange?: (files: VerificationAttachment[]) => void;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const { user } = useAuth();
  const individual = accountType === "individual",
    editable = Boolean(onChange);
  const [kind, setKind] = useState<VerificationAttachmentKind>(
    individual ? "portfolio" : "registration",
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const activeKind = individual
    ? "portfolio"
    : kind === "portfolio"
      ? "registration"
      : kind;
  function working(value: boolean) {
    setBusy(value);
    onBusyChange?.(value);
  }
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files || []);
    event.target.value = "";
    if (!user || !picked.length || busy || disabled || !onChange) return;
    if (picked.length + files.length > VERIFICATION_MAX_FILES) {
      setError(`Можно прикрепить до ${VERIFICATION_MAX_FILES} файлов.`);
      return;
    }
    if (picked.some((file) => file.size > VERIFICATION_FILE_LIMIT)) {
      setError("Каждый файл — не больше 10 МБ.");
      return;
    }
    working(true);
    setError("");
    let next = files;
    try {
      for (const file of picked) {
        const body = new FormData();
        body.append("file", file);
        body.append("kind", activeKind);
        const response = await verificationFileRequest(
          user,
          getApiUrl("/api/verification/files"),
          { method: "POST", body },
        );
        const result = await response.json();
        next = [...next, result.file];
        onChange(next);
      }
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Не удалось загрузить документ.",
      );
    } finally {
      working(false);
    }
  }
  async function open(file: VerificationAttachment) {
    if (!user || busy) return;
    const tab = window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    working(true);
    setError("");
    try {
      const response = await verificationFileRequest(
        user,
        getApiUrl(`/api/verification/files/${file.id}`),
      );
      const url = URL.createObjectURL(await response.blob());
      if (tab) tab.location.href = url;
      else {
        const link = document.createElement("a");
        link.href = url;
        link.download = file.name;
        link.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 120_000);
    } catch (error) {
      tab?.close();
      setError(
        error instanceof Error ? error.message : "Не удалось открыть документ.",
      );
    } finally {
      working(false);
    }
  }
  async function remove(file: VerificationAttachment) {
    if (!user || busy || disabled || !onChange) return;
    working(true);
    setError("");
    try {
      await verificationFileRequest(
        user,
        getApiUrl(`/api/verification/files/${file.id}`),
        { method: "DELETE" },
      );
      onChange(files.filter((item) => item.id !== file.id));
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Не удалось удалить файл.",
      );
    } finally {
      working(false);
    }
  }
  return (
    <section className="mt-5 rounded-2xl border border-blue-100 bg-blue-50/40 p-4 sm:p-5">
      <h3 className="flex items-center gap-2 font-bold text-slate-900">
        <Paperclip size={18} className="text-blue-600" />
        {individual ? "Портфолио" : "Документы компании"}
        {individual && editable ? (
          <span className="text-xs font-normal text-slate-500">
            необязательно
          </span>
        ) : null}
      </h3>
      {editable ? (
        <>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {individual
              ? "Есть фото ваших работ? Добавьте их, если хотите. Отсутствие портфолио не мешает проверке."
              : "Приложите документы о регистрации и, при необходимости, документ о ваших полномочиях."}
          </p>
          {!individual ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {(["registration", "authority"] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  disabled={busy || disabled}
                  onClick={() => setKind(kind)}
                  aria-pressed={activeKind === kind}
                  className={`rounded-xl border px-3 py-2 text-xs font-bold ${activeKind === kind ? "border-blue-500 bg-white text-blue-700" : "border-slate-200 text-slate-500"}`}
                >
                  {verificationAttachmentLabel(kind)}
                </button>
              ))}
            </div>
          ) : null}
          {!individual ? (
            <p className="mt-3 text-xs leading-5 text-slate-500">
              {activeKind === "registration"
                ? accountType === "ip"
                  ? "Например, лист записи ЕГРИП или свидетельство о регистрации ИП. Устав для ИП не нужен."
                  : "Например, лист записи ЕГРЮЛ, выписка или устав ООО. Документ должен позволять сопоставить компанию и заявителя."
                : "Представителю подойдёт доверенность, приказ или другой документ, подтверждающий связь с компанией и полномочия действовать от её имени."}
            </p>
          ) : null}
          <label
            className={`mt-4 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-blue-200 bg-white px-4 py-2 text-sm font-bold text-blue-700 ${busy || disabled || files.length >= VERIFICATION_MAX_FILES ? "pointer-events-none opacity-50" : ""}`}
          >
            {busy ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Paperclip size={16} />
            )}
            {busy
              ? "Загружаем…"
              : individual
                ? "Добавить фото работ"
                : "Прикрепить документы"}
            <input
              aria-label={
                individual ? "Добавить фото работ" : "Прикрепить документы"
              }
              type="file"
              multiple
              className="sr-only"
              accept={
                individual
                  ? "image/jpeg,image/png,image/webp"
                  : VERIFICATION_FILE_ACCEPT
              }
              onChange={(event) => void upload(event)}
              disabled={
                busy || disabled || files.length >= VERIFICATION_MAX_FILES
              }
            />
          </label>
          <p className="mt-2 text-xs text-slate-400">
            {individual ? "JPG, PNG, WebP" : "PDF, JPG, PNG, WebP"} · до 10 МБ
            на файл · до 6 файлов
          </p>
        </>
      ) : null}
      <div className="mt-3 space-y-2">
        {files.map((file) => (
          <div
            key={file.id}
            className="flex min-w-0 items-center gap-2 rounded-xl border border-slate-100 bg-white p-3"
          >
            <FileText size={19} className="shrink-0 text-blue-600" />
            <button
              type="button"
              disabled={busy}
              onClick={() => void open(file)}
              className="min-w-0 flex-1 text-left"
            >
              <span className="block truncate text-sm font-semibold text-slate-800">
                {file.name}
              </span>
              <span className="mt-0.5 block text-xs text-slate-400">
                {verificationAttachmentLabel(file.kind)} ·{" "}
                {(file.size / 1024 / 1024).toFixed(1)} МБ · Открыть
              </span>
            </button>
            {editable ? (
              <button
                type="button"
                aria-label={`Убрать ${file.name}`}
                onClick={() => void remove(file)}
                disabled={busy || disabled}
                className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
              >
                <Trash2 size={17} />
              </button>
            ) : null}
          </div>
        ))}
      </div>
      {!editable && !files.length ? (
        <p className="mt-2 text-sm text-slate-500">Файлы не приложены</p>
      ) : null}
      <p className="mt-3 flex items-start gap-1.5 text-xs leading-5 text-slate-500">
        <LockKeyhole size={13} className="mt-1 shrink-0" />
        Файлы доступны только вам и модератору, в объявлениях они не появятся
      </p>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </section>
  );
}
