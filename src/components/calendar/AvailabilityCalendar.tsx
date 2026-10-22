"use client";
import Link from "next/link";
import { ArrowUpRight, CalendarDays, Check, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { CALENDAR_MONTHS, CALENDAR_STATUSES, CALENDAR_STATUS, CALENDAR_WEEKDAYS, calendarCells, calendarDate, calendarDateKey, calendarDayLabel, calendarMonthKey, calendarStats, nextCalendarFreeDay, toggleCalendarDate, type CalendarStatus } from "@/lib/availability-calendar";
import { useAvailabilityDays } from "@/lib/useAvailabilityDays";
import { saveAvailabilityDates } from "@/lib/saveAvailability";
import s from "./AvailabilityCalendar.module.css";

function useToday() {
  const [today, setToday] = useState(() => calendarDateKey(new Date()));
  useEffect(() => {
    const update = () => setToday(calendarDateKey(new Date()));
    const midnight = new Date(); midnight.setHours(24, 0, 0, 50);
    const timer = setTimeout(update, midnight.getTime() - Date.now());
    window.addEventListener("focus", update); document.addEventListener("visibilitychange", update);
    return () => { clearTimeout(timer); window.removeEventListener("focus", update); document.removeEventListener("visibilitychange", update); };
  }, [today]);
  return today;
}

function Mark({ status, selected = false }: { status?: CalendarStatus; selected?: boolean }) {
  return <span aria-hidden="true" className={`${s.mark} ${s[status || "unmarked"]} ${selected ? s.markSelected : ""}`} />;
}

export default function AvailabilityCalendar({ ownerId, editable, displayName }: { ownerId: string; editable: boolean; displayName?: string }) {
  const today = useToday();
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1, 12));
  const [selected, setSelected] = useState<string[]>(() => [calendarDateKey(new Date())]);
  const [draft, setDraft] = useState<CalendarStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [direction, setDirection] = useState(1);
  const busy = useRef(false), scope = useRef(ownerId);
  scope.current = ownerId;
  useEffect(() => { scope.current = ownerId; return () => { scope.current = ""; }; }, [ownerId]);
  const { days, loading, error, refresh } = useAvailabilityDays(ownerId);
  const cells = useMemo(() => calendarCells(month), [month]);
  const stats = useMemo(() => calendarStats(days, month), [days, month]);
  const total = Object.values(stats).reduce((sum, value) => sum + value, 0);
  const nextFree = nextCalendarFreeDay(days, month, today);
  const selectedDay = selected.length === 1 ? selected[0] : undefined;
  const savedStatus = selectedDay ? days[selectedDay]?.status : undefined;
  const activeStatus = draft ?? savedStatus ?? "free";

  function chooseDay(key: string) {
    if (busy.current) return;
    setSelected(current => toggleCalendarDate(current, key, editable)); setDraft(null); setNotice(null);
  }
  function changeMonth(offset: number) {
    if (busy.current) return;
    setDirection(offset); setMonth(current => new Date(current.getFullYear(), current.getMonth() + offset, 1, 12));
    setSelected([]); setDraft(null); setNotice(null);
  }
  function goToday() {
    if (busy.current) return;
    const date = calendarDate(today)!;
    setDirection(date.getTime() >= month.getTime() ? 1 : -1); setMonth(new Date(date.getFullYear(), date.getMonth(), 1, 12));
    setSelected([today]); setDraft(null); setNotice(null);
  }
  async function commit(clear: boolean) {
    if (!editable || busy.current || !selected.length || loading || error) return;
    const uid = ownerId, dates = [...selected], status = activeStatus;
    busy.current = true; setSaving(true); setNotice(null);
    try {
      await saveAvailabilityDates(uid, dates, clear ? null : status);
      if (scope.current !== uid) return;
      if (clear) { setSelected([]); setDraft(null); }
      setNotice({ text: clear ? "Отметки сняты" : "Изменения сохранены", error: false });
    } catch {
      if (scope.current === uid) setNotice({ text: "Не получилось сохранить календарь. Проверьте соединение и повторите попытку.", error: true });
    } finally { busy.current = false; if (scope.current === uid) setSaving(false); }
  }

  return <main className={s.page}><div className={s.content}>
    <header className={s.heading}><div>
      <p className={s.eyebrow}>{editable ? "ЛИЧНЫЙ КАБИНЕТ / МОЙ ГРАФИК" : "РАСПИСАНИЕ ИСПОЛНИТЕЛЯ"}</p>
      <h1>Календарь занятости</h1>
      <p className={s.subtitle}>{editable ? "Отмечайте дни, в которые готовы принимать заказы." : `${displayName || "Исполнитель"} · выберите подходящий день перед обсуждением заказа.`}</p>
    </div><Link href={editable ? `/availability/${ownerId}` : `/user/${ownerId}`} className={s.outlineButton}><ArrowUpRight size={18} strokeWidth={1.8} />{editable ? "Публичный календарь" : "Профиль исполнителя"}</Link></header>

    <section className={s.summary} aria-label="Занятость в выбранном месяце" aria-busy={loading}>
      <div className={s.stats}>{CALENDAR_STATUSES.map(status => <div key={status} className={`${s.stat} ${s[status]}`}><strong>{loading ? "—" : String(stats[status]).padStart(2, "0")}</strong><span>{CALENDAR_STATUS[status].summary}</span></div>)}</div>
      <div className={s.distribution} aria-hidden="true">{CALENDAR_STATUSES.map(status => stats[status] > 0 ? <span key={status} data-status={status} style={{ flex: stats[status] / (total || 1) }} /> : null)}</div>
    </section>
    {error ? <div className={s.loadError} role="alert"><span>{error}</span><button type="button" onClick={refresh}>Повторить</button></div> : null}

    <div className={s.mainGrid}>
      <section className={s.calendarCard} aria-label="Даты календаря" aria-busy={loading}>
        <div className={s.monthHeader}><div className={s.monthLabel}><h2>{CALENDAR_MONTHS[month.getMonth()]}</h2><span>{month.getFullYear()}</span></div><div className={s.monthActions}>
          <button type="button" className={s.todayButton} onClick={goToday} disabled={saving}>Сегодня</button>
          <button type="button" className={s.iconButton} aria-label="Предыдущий месяц" onClick={() => changeMonth(-1)} disabled={saving}><ChevronLeft size={18} strokeWidth={1.8} /></button>
          <button type="button" className={s.iconButton} aria-label="Следующий месяц" onClick={() => changeMonth(1)} disabled={saving}><ChevronRight size={18} strokeWidth={1.8} /></button>
        </div></div>
        <div className={s.weekdays} aria-hidden="true">{CALENDAR_WEEKDAYS.map((day, index) => <span data-weekend={index > 4 || undefined} key={day}>{day}</span>)}</div>
        <div key={calendarMonthKey(month)} className={s.days} role="group" aria-label={`${CALENDAR_MONTHS[month.getMonth()]} ${month.getFullYear()}`} style={{ "--calendar-direction": direction } as CSSProperties}>
          {cells.map(cell => {
            if (!cell.currentMonth) return <span key={cell.key} className={s.adjacent} aria-hidden="true">{cell.day}</span>;
            const status = days[cell.key]?.status, chosen = selected.includes(cell.key);
            return <button type="button" key={cell.key} data-date={cell.key} data-status={status || "unmarked"} aria-label={`${calendarDayLabel(cell.key, { day: "numeric", month: "long", year: "numeric", weekday: "long" })}, ${status ? CALENDAR_STATUS[status].label : "статус не отмечен"}${cell.key === today ? ", сегодня" : ""}`} aria-pressed={chosen} aria-current={cell.key === today ? "date" : undefined} disabled={saving || loading} className={`${s.day} ${chosen ? s.selected : ""}`} onClick={() => chooseDay(cell.key)}>
              <span className={s.dayNumber}>{cell.day}</span><span className={s.dayStatus}><Mark status={status} selected={chosen} /><span>{status ? CALENDAR_STATUS[status].short : "Не отмечен"}</span></span>
            </button>;
          })}
        </div>
        <div className={s.calendarHint}><CalendarDays size={16} strokeWidth={1.8} /><span>{loading ? "Загружаем расписание…" : editable ? "Можно выбрать один день или сразу несколько дат." : "Нажмите на день, чтобы посмотреть его статус."}</span></div>
      </section>

      <aside className={s.editor}>
        <div className={s.selectionHeading}><div className={s.selectionMeta}><span>{editable ? "ВЫБРАННЫЙ ДЕНЬ" : "ПОДРОБНЕЕ О ДНЕ"}</span>{selectedDay === today ? <span className={s.todayTag}>СЕГОДНЯ</span> : null}</div>
          <h2>{selectedDay ? calendarDayLabel(selectedDay) : selected.length ? `Выбрано дат: ${selected.length}` : "Выберите день"}</h2>
          <p>{selectedDay ? `${calendarDayLabel(selectedDay, { weekday: "long" })} · ${calendarDate(selectedDay)!.getFullYear()}` : selected.length ? "Назначьте один статус выбранным датам" : editable ? "Нажмите на дату в календаре" : "Посмотрите свободные дни исполнителя"}</p>
        </div>
        {editable ? <>
          <div className={s.statusOptions} role="group" aria-label="Статус выбранных дней">{CALENDAR_STATUSES.map(status => <button type="button" key={status} className={s.statusOption} data-status={status} aria-pressed={activeStatus === status} disabled={saving} onClick={() => { setDraft(status); setNotice(null); }}>
            <Mark status={status} /><span className={s.optionCopy}><span className={s.longLabel}>{CALENDAR_STATUS[status].label}</span><span className={s.shortLabel}>{CALENDAR_STATUS[status].short}</span><small>{CALENDAR_STATUS[status].description}</small></span>{activeStatus === status ? <Check size={14} strokeWidth={1.8} className={s.optionCheck} /> : null}
          </button>)}</div>
          <button type="button" onClick={() => void commit(false)} disabled={!selected.length || saving || loading || Boolean(error)} aria-busy={saving} className={s.saveButton}>{saving ? <Loader2 size={18} className={s.spinner} /> : <Check size={18} strokeWidth={1.8} />}{saving ? "Сохраняем…" : "Сохранить изменения"}</button>
          {notice ? <p role={notice.error ? "alert" : "status"} className={`${s.notice} ${notice.error ? s.noticeError : ""}`}>{notice.text}</p> : <p className={s.publicHint}>Статус дня виден заказчикам<br className={s.desktopBreak} /> в вашем публичном календаре.</p>}
          <button type="button" className={s.clearButton} disabled={!selected.length || saving || loading || Boolean(error)} onClick={() => void commit(true)}>{selected.length > 1 ? "Снять отметки" : "Снять отметку"}</button>
        </> : <>
          <div className={`${s.readOnlyStatus} ${s[savedStatus || "unmarked"]}`}><Mark status={savedStatus} /><div><strong>{savedStatus ? CALENDAR_STATUS[savedStatus].label : "Статус не отмечен"}</strong><p>{savedStatus ? CALENDAR_STATUS[savedStatus].description : "Доступность этого дня лучше уточнить у исполнителя."}</p></div></div>
          <p className={s.publicHint}>{nextFree ? `Ближайший отмеченный свободный день — ${calendarDayLabel(nextFree)}.` : "В этом месяце будущие свободные дни пока не отмечены."}</p>
        </>}
      </aside>
    </div>
    <footer className={s.footer}><div className={s.legend} aria-label="Обозначения статусов">{CALENDAR_STATUSES.map(status => <span className={s.legendItem} key={status}><Mark status={status} /><span>{CALENDAR_STATUS[status].short}</span></span>)}<span className={s.legendItem}><Mark /><span>Не отмечен</span></span></div><span>Мой график на сайте и в приложении</span></footer>
  </div></main>;
}

export function CalendarAccessState({ loading = false }: { loading?: boolean }) {
  return <main className={s.page}><div className={s.accessState}>{loading ? <Loader2 size={26} className={s.spinner} /> : <CalendarDays size={36} strokeWidth={1.8} />}<h1>{loading ? "Загружаем календарь…" : "Сначала войдите в аккаунт"}</h1>{!loading ? <><p>После входа можно будет управлять своим расписанием.</p><Link className={s.saveButton} href="/auth">Войти</Link></> : null}</div></main>;
}
