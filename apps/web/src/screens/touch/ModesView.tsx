import type { ModeCard } from '../../i18n/messages';
import { useLanguage } from '../../i18n/use-language';
import styles from './modes.module.css';

const renderCard = (card: ModeCard) => (
  <li key={card.mode} className={styles.card}>
    <img
      className={styles.preview}
      src={card.preview}
      alt={card.previewAlt}
      width={300}
      height={300}
      loading="lazy"
    />
    <div className={styles.text}>
      <h3 className={styles.cardTitle}>{card.title}</h3>
      <p className={styles.cardBody}>{card.body}</p>
    </div>
  </li>
);

/**
 * «Режими» `26:1957` / `47:4183`: h1 and liquid-glass cards
 * (design-system.md § 6.5). Only «Комета» is listed for now; the card is
 * static until stage 4 wires the instruction / settings flow behind it.
 */
export const ModesView = () => {
  const { messages } = useLanguage();
  const { title, cards } = messages.touch.modes;
  return (
    <div className={styles.modes}>
      <h2 className={styles.title}>{title}</h2>
      <ul className={styles.list}>{cards.map(renderCard)}</ul>
    </div>
  );
};
