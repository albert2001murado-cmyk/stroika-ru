import { MessageCircle } from "lucide-react";
import styles from "./messages.module.css";

export default function MessagesPage() {
  return <section className={styles.welcome} aria-label="Выберите переписку">
    <div className={styles.welcomeMark}><MessageCircle size={30} strokeWidth={1.5} /></div>
    <span className={styles.smallLabel}>На связи</span>
    <h2>Разговор начинается здесь</h2>
    <p>Выберите переписку слева.<br />Новый диалог можно открыть из объявления.</p>
  </section>;
}
