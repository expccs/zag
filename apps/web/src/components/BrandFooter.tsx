import styles from './brand-footer.module.css';

/** Expolight and Kabluka logos, sizes from Home `8:3824`. */
export const BrandFooter = () => (
  <footer className={styles.footer}>
    <img src="/expolight.png" width={138} height={38} alt="Expolight" />
    <img src="/kabluka.png" width={88} height={25} alt="Kabluka" />
  </footer>
);
