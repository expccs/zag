import styles from './zag-header.module.css';

/** Pattern logo strip, 374 × 34 at y = 27 (design-system.md § 1). */
export const ZagHeader = () => (
  <header className={styles.header}>
    <img className={styles.logo} src="/zag-header.svg" alt="ZAG" />
  </header>
);
