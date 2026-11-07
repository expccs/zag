import styles from './brand-footer.module.css';

/** Expolight 127 × 35 and Kabluka 82 × 23 logos (design-system.md § 1). */
export const BrandFooter = () => (
  <footer className={styles.footer}>
    <img src="/expolight.png" width={127} height={35} alt="Expolight" />
    <img src="/kabluka.png" width={82} height={23} alt="Kabluka" />
  </footer>
);
