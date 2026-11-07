import { useLanguage } from '../i18n/use-language';
import styles from './lang-switch.module.css';

export interface LangSwitchProps {
  /** Home pill is 56 × 44.5 with a 12.2 label; other screens 52 × 41 / 11.5. */
  size?: 'home' | 'screen';
}

const chevron = (
  <svg
    className={styles.chevron}
    viewBox="0 0 14 6"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M0 0h14L7 5.2z" fill="currentColor" />
  </svg>
);

/** Glass pill with the current language and a chevron; tap toggles UA/ENG. */
export const LangSwitch = ({ size = 'screen' }: LangSwitchProps) => {
  const { messages, toggleLanguage } = useLanguage();
  return (
    <button
      type="button"
      className={`glass-pill ${styles.pill} ${styles[size]}`}
      onClick={toggleLanguage}
      aria-label={messages.langSwitchHint}
    >
      <span className={styles.label}>{messages.langLabel}</span>
      {chevron}
    </button>
  );
};
