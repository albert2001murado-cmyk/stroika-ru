"use client";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ArrowUpRight, Box, Building2, Check, ChevronDown, Clock3, Gift, Layers3, Loader2, LockKeyhole, ReceiptText, ShieldCheck, Truck, Wrench } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { useBilling } from "@/lib/useBilling";
import { accountRequest, newAccountRequestId } from "@/lib/accountClient";
import { BILLING_CATALOGS, BILLING_PLANS, BILLING_RULES, CATALOG_TITLES, INTRO_LIMITS, billingPrice, billingQuote, billingCount, type BillingCatalog, type BillingPlan } from "@/lib/billing";
import styles from "./plans.module.css";

const catalogDetails = {
  materials: { icon: Box, label: "Для поставщиков и производителей", description: "Разные товары — в одном каталоге", rule: "До 25 разных товаров в категориях и подкатегориях, без одинаковых объявлений" },
  services: { icon: Wrench, label: "Для мастеров и бригад", description: "Ваш опыт заслуживает новых задач", rule: "До 10 разных предложений. Одинаковые объявления в одной подкатегории и городе запрещены" },
  equipment: { icon: Truck, label: "Для владельцев техники", description: "Больше задач для вашего автопарка", rule: "До 10 объявлений, одно активное в каждой подкатегории независимо от города. Машины одного типа укажите в одной анкете" },
  solutions: { icon: Building2, label: "Для команд и подрядчиков", description: "Для проектов, которые требуют команды", rule: "До 10 объявлений — строительство, комплексный ремонт, проектирование и другие крупные направления" },
};
const planDetails = { start: "Для точечных задач", business: "Для постоянной работы", pro: "Для большого объёма", max: "Для широкого ассортимента" };
function ActionButton({ children, onClick, disabled, busy, secondary, title }: { children: ReactNode; onClick: () => void; disabled?: boolean; busy?: boolean; secondary?: boolean; title?: string }) {
  return <button type="button" title={title} onClick={onClick} disabled={disabled || busy} aria-busy={busy || undefined} className={`${styles.action} ${secondary ? styles.actionSecondary : ""}`}><span className={styles.actionLabel}>{busy ? <Loader2 aria-hidden="true" size={18} className={styles.spinner}/> : null}{children}</span><span className={styles.actionArrow} aria-hidden="true"><ArrowUpRight size={19}/></span></button>;
}
export default function PlansPage() {
  const { user, profile, loading: authLoading } = useAuth(), billing = useBilling();
  const [catalog, setCatalog] = useState<BillingCatalog>("materials"), [accepted, setAccepted] = useState(false), [email, setEmail] = useState("");
  const [busy, setBusy] = useState(""), [message, setMessage] = useState(""), [error, setError] = useState("");
  const requests = useRef<Record<string, string>>({}), actionLock = useRef(false);
  useEffect(() => { const value = new URLSearchParams(window.location.search).get("catalog"); if (BILLING_CATALOGS.includes(value as BillingCatalog)) setCatalog(value as BillingCatalog); }, []);
  useEffect(() => setEmail(profile?.email || user?.email || ""), [profile?.email, user?.uid, user?.email]);
  useEffect(() => { requests.current = {}; setAccepted(false); setMessage(""); setError(""); }, [user?.uid]);
  useEffect(() => { const onFocus = () => void billing.refresh(); window.addEventListener("focus", onFocus); return () => window.removeEventListener("focus", onFocus); }, [billing.refresh]);
  const current = billing.data?.subscriptions[catalog], active = current && !current.revoked && current.endsAt > Date.now();
  const gift = billing.data?.introEligible && !billing.data.introClaimed[catalog] && !active;
  const plans = BILLING_PLANS.filter(p => p.catalog === catalog), details = catalogDetails[catalog], CatalogIcon = details.icon;
  async function action(key: string, run: () => Promise<void>) {
    if (actionLock.current) return; actionLock.current = true; setBusy(key); setError(""); setMessage("");
    try { await run(); await billing.refresh(); } catch (e) { setError((e as Error).message); } finally { actionLock.current = false; setBusy(""); }
  }
  async function buy(plan: BillingPlan) {
    await action(plan.tier, async () => {
      if (!accepted) throw new Error("Подтвердите условия перед оплатой");
      const quote = billingQuote(catalog, plan.tier, current);
      const key = `${user?.uid}:${catalog}:${plan.tier}:${quote.periodId}`;
      const id = requests.current[key] ||= newAccountRequestId();
      const externalTokenId = sessionStorage.getItem(`strova-apple-checkout:${user?.uid}`) || undefined;
      const result = await accountRequest<{ id: string; status: string; confirmationUrl?: string }>("/api/billing/checkout", { provider: "yookassa", catalog, tier: plan.tier, receiptEmail: email, acceptRules: true, expectedPriceKopeks: quote.priceKopeks, requestId: id, externalTokenId });
      if (result.status === "succeeded") { setMessage("Тариф активирован — можно размещать объявления"); return; }
      if (result.confirmationUrl) { window.location.assign(result.confirmationUrl); return; }
      setMessage("Заказ сохранён. Проверьте статус оплаты ниже");
    });
  }
  const pending = billing.data?.pending.filter(p => p.catalog === catalog) || [];
  if (authLoading) return <main className={styles.page}><div className={styles.loading}><Loader2 className={styles.spinner} size={22}/>Загружаем тарифы</div></main>;
  if (!user) return <main className={styles.page}><section className={styles.signIn}><h1>Место для<br/>вашего дела</h1><p>Войдите, чтобы увидеть доступные подарки и выбрать размещения</p><Link href="/auth?next=/plans" className={styles.signInLink}>Войти в аккаунт <ArrowRight size={19}/></Link></section></main>;
  return <main className={styles.page}>
    <div className={styles.topline}><Link href="/profile" className={styles.back}><ArrowLeft size={17}/>В профиль</Link><span className={styles.toplineNote}>СТРОВА ДЛЯ ВАШЕГО ДЕЛА</span><a href="#placement-terms" className={styles.termsLink}>Условия <ArrowUpRight size={15}/></a></div>
    <header className={styles.hero}>
      <div className={styles.heroCopy}><h1>Тариф под<br/>ваши <span>задачи</span></h1><p>Выберите, сколько предложений разместить<br className={styles.desktopBreak}/> Всё остальное — ваше дело</p><div className={styles.heroFacts}><span><Clock3 size={16}/>30 дней</span><i/><span><ShieldCheck size={17}/>Без автосписаний</span></div></div>
      <div className={styles.heroVisual} aria-label={`${CATALOG_TITLES[catalog]}: до ${plans[plans.length - 1].limit} объявлений`}>
        <div className={styles.visualCorner}>01 — 04 <span>КАТАЛОГИ СТРОВЫ</span></div>
        <div className={styles.ticketBack}/><div className={styles.ticket} key={catalog}><div className={styles.ticketHead}><span><CatalogIcon size={19}/>{CATALOG_TITLES[catalog]}</span><ArrowUpRight size={22}/></div><p className={styles.ticketNumber}>до {plans[plans.length - 1].limit}<span>объявлений</span></p><div className={styles.ticketBars} aria-hidden="true">{plans.map((p, index) => <span key={p.tier} style={{ "--bar-height": `${26 + index * (60 / (plans.length - 1))}%`, "--bar-delay": `${index * 55}ms` } as CSSProperties}><b>{p.limit}</b></span>)}</div><div className={styles.ticketFoot}><span>Ваш следующий шаг</span><strong>от {billingPrice(plans[0].priceKopeks)}</strong></div></div>
        <div className={styles.visualFoot}><span>Размещайте больше</span><span>Растите в своём темпе <ArrowUpRight size={13}/></span></div>
      </div>
    </header>
    <section className={styles.catalogSection} aria-labelledby="catalog-heading"><div className={styles.sectionCaption}><span className={styles.step}>01</span><h2 id="catalog-heading">Выберите каталог</h2><span>Для каждого — свой тариф</span></div>
      <nav className={styles.catalogs} aria-label="Каталоги тарифов">{BILLING_CATALOGS.map(id => { const Icon = catalogDetails[id].icon; return <button key={id} type="button" aria-pressed={catalog === id} className={`${styles.catalog} ${catalog === id ? styles.catalogActive : ""}`} onClick={() => { setCatalog(id); setError(""); setMessage(""); }}><span className={styles.catalogIcon}><Icon size={22}/></span><span>{CATALOG_TITLES[id]}</span><ArrowUpRight size={17} className={styles.catalogArrow}/></button>; })}</nav>
    </section>
    <section className={styles.planSection} aria-labelledby="plans-heading"><div className={styles.plansHeading}><div><h2 id="plans-heading">{CATALOG_TITLES[catalog]}</h2><p>{details.description}</p></div><span className={styles.periodNote}><span/>Один период — 30 дней</span></div>
      {billing.loading && <p role="status" className={styles.loading}><Loader2 size={16} className={styles.spinner}/>Обновляем доступные размещения</p>}
      {active && <section className={styles.current}><div><span>Ваш текущий период</span><p><strong>{Math.max(0, current.limit - current.used)}</strong> из {current.limit} размещений доступно</p></div><div className={styles.currentRight}><span>До {new Date(current.endsAt).toLocaleString("ru-RU")}</span><div className={styles.progress} role="progressbar" aria-label="Использованные размещения" aria-valuenow={current.used} aria-valuemin={0} aria-valuemax={current.limit}><span style={{ width: `${Math.min(100, current.used / current.limit * 100)}%` }}/></div><small>Активные объявления сохраняют свой срок</small></div></section>}
      <section className={styles.checkoutSettings} aria-label="Данные для оплаты"><div className={styles.receipt}><label htmlFor="receiptEmail"><ReceiptText size={17}/>Почта для чека</label><input id="receiptEmail" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" placeholder="mail@example.ru"/></div><label className={styles.consent}><input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)}/><span className={styles.checkboxIcon} aria-hidden="true"><Check size={15}/></span><span><strong>Принимаю условия размещения</strong><small>30 дней · каждый каталог отдельно · остаток не переносится · без автосписаний</small></span></label></section>
      {gift && <section className={styles.gift}><div className={styles.giftIcon}><Gift size={25}/></div><div><h3>Начните бесплатно</h3><p>{billingCount(INTRO_LIMITS[catalog], "размещение", "размещения", "размещений")} на 30 дней · один раз при первой регистрации</p></div><ActionButton disabled={!accepted || Boolean(busy)} busy={busy === "intro"} secondary onClick={() => void action("intro", async () => { await accountRequest("/api/billing/intro", { catalog, acceptRules: true }); setMessage("Подарок активирован на 30 дней"); })}>Активировать подарок</ActionButton></section>}
      <div key={catalog} className={`${styles.planGrid} ${plans.length === 3 ? styles.planGridThree : ""}`}>{plans.map((plan, index) => {
        let quote, unavailable = ""; try { quote = billingQuote(catalog, plan.tier, current); } catch (e) { unavailable = (e as Error).message; }
        const isCurrent = active && current.tier === plan.tier;
        return <article key={plan.tier} className={`${styles.planCard} ${plan.tier === "pro" ? styles.planFeatured : ""}`} style={{ "--card-delay": `${index * 65}ms` } as CSSProperties}>
          <div className={styles.planTop}><span className={styles.planIndex}>0{index + 1}</span>{isCurrent ? <span className={styles.planTag}><Check size={13}/>Ваш тариф</span> : plan.tier === "pro" ? <span className={styles.planTag}><Layers3 size={13}/>Больше возможностей</span> : <ArrowUpRight size={19}/>}</div>
          <h3>{plan.title}</h3><p className={styles.planDescription}>{planDetails[plan.tier]}</p><div className={styles.planQuantity}><strong>{plan.limit}</strong><span>{billingCount(plan.limit).split(" ")[1]}</span></div>
          <p className={styles.planGift}>{plan.paid} оплаченных {plan.gift ? <span>+ {plan.gift} в подарок</span> : <span>без подарочных</span>}</p>
          <div className={styles.priceBlock}><p>{billingPrice(quote?.action === "upgrade" ? quote.priceKopeks : plan.priceKopeks)}</p><span>{quote?.action === "upgrade" ? `Доплата · до ${new Date(quote.endsAt).toLocaleDateString("ru-RU")}` : "за 30 дней в этом каталоге"}</span></div>
          <ul className={styles.planBenefits}><li><Check size={15}/>Каждое объявление — на 30 дней</li><li><Check size={15}/>{quote?.action === "upgrade" ? "Срок и использованный лимит сохраняются" : "Продление по вашему решению"}</li></ul>
          <ActionButton title={unavailable} disabled={!quote || !accepted || !billing.data?.yookassaReady || Boolean(busy)} busy={busy === plan.tier} onClick={() => void buy(plan)}>{busy === plan.tier ? "Готовим оплату…" : isCurrent ? "Ваш тариф" : quote?.action === "upgrade" ? "Повысить тариф" : "Выбрать тариф"}</ActionButton>
        </article>;
      })}</div>
      <div className={styles.paymentFoot}><span><LockKeyhole size={14}/>Оплата через ЮKassa</span><span>Без скрытых списаний <span aria-hidden="true">↗</span></span></div>
      {(error || billing.error) && <p role="alert" className={styles.error}>{error || billing.error}</p>}{message && <p role="status" className={styles.notice}><Check size={18}/>{message}</p>}
      {billing.data && !billing.data.yookassaReady && <p className={styles.availability}>Оплата временно недоступна. Бесплатные размещения можно активировать, если они доступны вашему аккаунту</p>}
    </section>
    {pending.length > 0 && <section className={styles.pending}><h2>Ваши оплаты</h2>{pending.map(order => <div key={order.id} className={styles.pendingRow}><span>{getStatus(order.status)} · <strong>{billingPrice(order.priceKopeks)}</strong></span>{order.confirmationUrl && order.provider === "yookassa" && <a href={order.confirmationUrl}>Открыть оплату <ArrowUpRight size={14}/></a>}{order.provider === "yookassa" && <button type="button" disabled={Boolean(busy)} onClick={() => void action(order.id, async () => { const r = await accountRequest("/api/billing/order", { id: order.id }); setMessage(getStatus(r.status)); })}>Проверить</button>}{["created", "pending"].includes(order.status) && <button type="button" disabled={Boolean(busy)} onClick={() => void action(order.id, async () => { await accountRequest("/api/billing/order", { id: order.id, action: "abandon" }); setMessage("Заказ закрыт. Если деньги уже списаны, дождитесь подтверждения или возврата"); })}>Закрыть заказ</button>}</div>)}</section>}
    <section id="placement-terms" className={styles.terms}><div className={styles.termsHeading}><span className={styles.step}>02</span><div><h2>Всё по делу<br/>и без сюрпризов</h2><p>Условия, которые полезно знать заранее</p></div><ShieldCheck size={30}/></div><div className={styles.termsBody}><details open><summary>Как работает размещение <ChevronDown size={18}/></summary><ul>{BILLING_RULES.map(rule => <li key={rule}><Check size={15}/>{rule}</li>)}</ul></details><details><summary>Условия выбранного каталога <ChevronDown size={18}/></summary><p>{details.rule}</p><p>Квота учитывает анкеты исполнителей и заявки заказчиков в этом каталоге</p></details><details><summary>Подарки при первой регистрации <ChevronDown size={18}/></summary><p>Материалы — 3 размещения, услуги — 1, техника — 2, комплексные решения — 1. Каждая группа активируется один раз на 30 дней, остаток не переносится</p><p>Одно бесплатное продление на 30 дней для одного выбранного объявления за всё время аккаунта. Проверка личности не влияет на право размещать объявления</p></details><details><summary>Оплата и поддержка <ChevronDown size={18}/></summary><p>Оплата подтверждается сервером платёжной системы. Вопросы оплаты и возврата — через поддержку в профиле</p><p>Повышение тарифа оплачивается разницей цен, дата окончания текущего периода сохраняется</p></details></div></section>
    <footer className={styles.footer}><span>СТРОВА</span><p>Вы строите своё дело — мы помогаем найти друг друга</p><ArrowUpRight size={20}/></footer>
  </main>;
}
function getStatus(status: string) { return ({ created: "Заказ создан", pending: "Ожидаем подтверждение оплаты", succeeded: "Тариф активирован", canceled: "Оплата отменена", abandoned: "Заказ закрыт", refund_due: "Готовится возврат оплаты", refunded: "Оплата возвращена", requires_review: "Покупка требует проверки поддержки" } as Record<string, string>)[status] || "Проверяем оплату"; }
