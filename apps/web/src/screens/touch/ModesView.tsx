import { Link } from 'react-router';
import type { ModeCard } from '../../i18n/messages';
import { useLanguage } from '../../i18n/use-language';
import { TouchChrome } from './TouchChrome';
import styles from './modes.module.css';

const renderCard = (card: ModeCard) => (
  <li key={card.mode}>
    <Link to={`/touch/${card.mode}`} className={`glass-card ${styles.card}`}>
      <img
        className={styles.preview}
        src={card.preview}
        alt={card.previewAlt}
        width={300}
        height={300}
        loading="lazy"
      />
      <span className={styles.text}>
        <span className={styles.cardTitle}>{card.title}</span>
        <span className={styles.cardBody}>{card.body}</span>
      </span>
    </Link>
  </li>
);

/**
 * «Режими» `26:1957` / `47:4183`: h1 and three liquid-glass cards
 * (design-system.md § 6.5), each opening the instructions of its mode.
 */
export const ModesView = () => {
  const { messages } = useLanguage();
  const { title, cards } = messages.touch.modes;
  return (
    <TouchChrome back="/mission">
      <div className={styles.modes}>
        <h1 className={styles.title}>{title}</h1>
        <ul className={styles.list}>{cards.map(renderCard)}</ul>
      </div>
    </TouchChrome>
  );
};

export default ModesView;
