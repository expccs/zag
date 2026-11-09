import { Link } from 'react-router';
import { useLanguage } from '../i18n/use-language';
import styles from './back-link.module.css';

export interface BackLinkProps {
  /** Route to go to, or a handler (e.g. leave the queue) for a button. */
  to: string | (() => void);
  /** `forward` flips the arrow (landscape countdown `31:2523`). */
  direction?: 'back' | 'forward';
}

const arrow = (direction: 'back' | 'forward') => (
  <svg
    className={`${styles.arrow} ${direction === 'back' ? styles.back : ''}`}
    viewBox="0 0 28.43 18.2"
    aria-hidden="true"
    focusable="false"
  >
    <path
      d="M28.07 9.98a1.24 1.24 0 0 0 0-1.75L20.2.36a1.24 1.24 0 0 0-1.75 1.75l6.99 6.99-6.99 6.99a1.24 1.24 0 0 0 1.75 1.75l7.87-7.86ZM0 9.1v1.24h27.19V7.87H0V9.1Z"
      fill="currentColor"
    />
  </svg>
);

/** White arrow 28 × 18 at x = 19, y = 119 (design-system.md § 6.8). */
export const BackLink = ({ to, direction = 'back' }: BackLinkProps) => {
  const { messages } = useLanguage();
  if (typeof to === 'string') {
    return (
      <Link to={to} className={styles.link} aria-label={messages.back}>
        {arrow(direction)}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={to}
      className={`${styles.link} ${styles.button}`}
      aria-label={messages.back}
    >
      {arrow(direction)}
    </button>
  );
};
