"use client";

import { db } from "@/lib/firebase";
import { isReviewApproved } from "@/lib/moderation";
import { firestoreDateToMillis, type Review } from "@/types";
import { collection, getDocs, query, where } from "firebase/firestore";
import { ArrowRight, MessageSquareText, Star, UserRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import styles from "./ProfileReviews.module.css";

type Props = { userId: string; listingIds?: string[]; requestIds?: string[]; compact?: boolean; plain?: boolean };

function chunks(values: string[], size = 10) {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, index * size + size));
}

function dateTime(value: unknown) {
  const millis = firestoreDateToMillis(value as any);
  if (!millis) return "Дата не указана";
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(millis));
}

export default function ProfileReviews({ userId, listingIds = [], requestIds = [], compact = false, plain = false }: Props) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    const jobs = [getDocs(query(collection(db, "reviews"), where("targetUserId", "==", userId)))];
    chunks(listingIds).forEach((ids) => jobs.push(getDocs(query(collection(db, "reviews"), where("listingId", "in", ids)))));
    chunks(requestIds).forEach((ids) => jobs.push(getDocs(query(collection(db, "reviews"), where("requestId", "in", ids)))));
    Promise.allSettled(jobs).then((results) => {
      if (!active) return;
      const byId = new Map<string, Review>();
      results.forEach((result) => {
        if (result.status !== "fulfilled") return;
        result.value.docs.forEach((item) => {
          const review = { id: item.id, ...item.data() } as Review;
          if (isReviewApproved(review)) byId.set(item.id, review);
        });
      });
      setReviews([...byId.values()].sort((a, b) => firestoreDateToMillis(b.createdAt) - firestoreDateToMillis(a.createdAt)));
    });
    return () => { active = false; };
  }, [userId, listingIds.join("|"), requestIds.join("|")]);

  const average = useMemo(() => reviews.length ? reviews.reduce((sum, item) => sum + Number(item.rating || 0), 0) / reviews.length : 0, [reviews]);

  if (plain) return <div className={styles.plain}>
    <div className={styles.heading}><div><span className={styles.eyebrow}>Опыт сотрудничества</span><h2>Отзывы<span>{reviews.length}</span></h2></div>{reviews.length ? <span className={styles.rating}><Star size={15} fill="currentColor" />{average.toFixed(1)}</span> : null}</div>
    {reviews.length ? <div className={styles.list}>{(expanded ? reviews : reviews.slice(0, 3)).map(review => {
      const kind = review.publicationKind || (review.requestId ? "request" : "listing");
      const publicationId = review.publicationId || review.requestId || review.listingId || "";
      const title = review.publicationTitle || review.requestTitle || review.listingTitle || "Публикация";
      const href = kind === "request" ? `/requests/${publicationId}` : `/listing/${publicationId}`;
      return <article key={review.id} className={styles.review}>
        <div className={styles.reviewTop}><span className={styles.avatar}>{review.authorAvatarUrl ? <img src={review.authorAvatarUrl} alt="" /> : <UserRound size={19} />}</span><div><p className={styles.author}>{review.authorName || "Пользователь"}</p><time>{dateTime(review.createdAt)}</time></div><span className={styles.stars} aria-label={`${review.rating} из 5`}>{[1,2,3,4,5].map(star => <Star key={star} size={12} fill={star <= Number(review.rating || 0) ? "currentColor" : "none"} data-filled={star <= Number(review.rating || 0)} />)}</span></div>
        <p className={styles.text}>{review.text || "Без текста"}</p>{publicationId ? <Link href={href} className={styles.link}>{title}<ArrowRight size={13} /></Link> : null}
      </article>;
    })}</div> : <div className={styles.empty}><MessageSquareText size={23} strokeWidth={1.5} /><div><h3>Здесь будут отзывы</h3><p>Отзывы появятся после проверки модератором.</p></div></div>}
    {reviews.length > 3 ? <button type="button" className={styles.expand} onClick={() => setExpanded(value => !value)} aria-expanded={expanded}>{expanded ? "Свернуть" : `Все отзывы · ${reviews.length}`}<ArrowRight size={14} /></button> : null}
  </div>;

  if (compact && !expanded) {
    const latest = reviews[0];
    const kind = latest?.publicationKind || (latest?.requestId ? "request" : "listing");
    const publicationId = latest?.publicationId || latest?.requestId || latest?.listingId || "";
    const title = latest?.publicationTitle || latest?.requestTitle || latest?.listingTitle || "Публикация";
    const href = kind === "request" ? `/requests/${publicationId}` : `/listing/${publicationId}`;

    return (
      <section className="my-profile-card rounded-[24px] border border-white bg-white p-4 shadow-sm sm:rounded-[30px] sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-500">
              <Star className="fill-amber-400" size={21} />
            </span>
            <div className="min-w-0">
              <h2 className="font-black text-slate-950 sm:text-lg">Отзывы и рейтинг</h2>
              <p className="text-xs font-bold text-slate-400">Отзывы с сайта и приложения</p>
            </div>
          </div>
          <div className="rounded-2xl bg-blue-50 px-4 py-2 text-sm font-black text-[#0057ff]">
            {reviews.length ? `${average.toFixed(1)} ★ · ${reviews.length}` : "Отзывов нет"}
          </div>
        </div>

        {latest ? (
          <div className="mt-4 rounded-[20px] border border-slate-100 bg-slate-50/80 p-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <p className="font-black text-slate-900">{latest.authorName || "Пользователь"}</p>
                <time className="text-xs font-bold text-slate-400">{dateTime(latest.createdAt)}</time>
              </div>
              <p className="mt-1 line-clamp-2 text-sm font-semibold leading-5 text-slate-600">{latest.text || "Без текста"}</p>
            </div>
            {publicationId ? (
              <Link href={href} className="mt-2 inline-flex max-w-full items-center gap-1 text-xs font-black text-[#0057ff]">
                <span className="truncate">{title}</span><ArrowRight className="shrink-0" size={14} />
              </Link>
            ) : null}
          </div>
        ) : (
          <p className="mt-4 rounded-[20px] bg-slate-50 px-4 py-3 text-sm font-bold text-slate-500">
            Одобренные отзывы появятся здесь после модерации.
          </p>
        )}
        {reviews.length > 0 ? (
          <button type="button" onClick={() => setExpanded(true)} aria-expanded={false} className="mt-3 inline-flex items-center gap-1 rounded-lg px-2 py-2 text-sm font-black text-[#0057ff] transition hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-blue-600">
            Все отзывы ({reviews.length})<ArrowRight size={16} />
          </button>
        ) : null}
      </section>
    );
  }

  return (
    <section className={`${compact ? "" : "mt-7"} rounded-[30px] bg-white p-5 shadow-sm ring-1 ring-slate-200/70 sm:p-7`}>
      {compact ? <button type="button" onClick={() => setExpanded(false)} aria-expanded={true} className="mb-3 rounded-lg px-2 py-2 text-sm font-black text-[#0057ff] transition hover:bg-blue-50">Свернуть отзывы</button> : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[#0057ff]">Единая история</p>
          <h2 className="mt-1 text-2xl font-black text-slate-950">Отзывы о пользователе</h2>
        </div>
        <div className="rounded-2xl bg-blue-50 px-4 py-2 text-sm font-black text-[#0057ff]">
          {reviews.length ? `${average.toFixed(1)} ★ · ${reviews.length}` : "Пока нет отзывов"}
        </div>
      </div>

      {reviews.length === 0 ? (
        <div className="mt-5 flex items-center gap-3 rounded-[22px] bg-slate-50 p-5 text-sm font-bold text-slate-500">
          <MessageSquareText className="text-blue-300" /> Отзывы с сайта и приложения появятся здесь после модерации.
        </div>
      ) : (
        <div className="mt-5 grid gap-3">
          {reviews.map((review) => {
            const kind = review.publicationKind || (review.requestId ? "request" : "listing");
            const publicationId = review.publicationId || review.requestId || review.listingId || "";
            const title = review.publicationTitle || review.requestTitle || review.listingTitle || "Публикация";
            const href = kind === "request" ? `/requests/${publicationId}` : `/listing/${publicationId}`;
            return (
              <article key={review.id} className="rounded-[24px] border border-slate-100 bg-slate-50/70 p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-blue-100 text-[#0057ff]">
                    {review.authorAvatarUrl ? <img src={review.authorAvatarUrl} alt="" className="h-full w-full object-cover" /> : <UserRound size={20} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-black text-slate-950">{review.authorName || "Пользователь"}</p>
                      <time className="text-xs font-bold text-slate-400">{dateTime(review.createdAt)}</time>
                    </div>
                    <div className="mt-1 flex gap-0.5">{[1,2,3,4,5].map((star) => <Star key={star} size={15} className={star <= Number(review.rating || 0) ? "fill-amber-400 text-amber-400" : "text-slate-300"} />)}</div>
                    <p className="mt-3 whitespace-pre-line text-sm font-medium leading-6 text-slate-600">{review.text || "Без текста"}</p>
                    {publicationId ? <Link href={href} className="mt-3 inline-flex items-center gap-1 text-xs font-black text-[#0057ff]">{title}<ArrowRight size={14} /></Link> : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
