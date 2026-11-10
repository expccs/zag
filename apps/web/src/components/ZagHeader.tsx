import { BrandLink } from './BrandLink';
import styles from './zag-header.module.css';

/**
 * Pattern logo strip, 374 × 34 at y = 27 (design-system.md § 1); a link
 * to the gallery site.
 */
export const ZagHeader = () => (
  <header className={styles.header}>
    <BrandLink brand="zag" className={styles.link}>
      <img className={styles.logo} src="/zag-header.svg" alt="ZAG" />
    </BrandLink>
  </header>
);
