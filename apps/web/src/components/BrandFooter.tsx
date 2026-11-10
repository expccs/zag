import { BrandLink } from './BrandLink';
import styles from './brand-footer.module.css';

/** Expolight and Kabluka logos (sizes from Home `8:3824`), each a link. */
export const BrandFooter = () => (
  <footer className={styles.footer}>
    <BrandLink brand="expolight">
      <img src="/expolight.png" width={138} height={38} alt="Expolight" />
    </BrandLink>
    <BrandLink brand="kabluka">
      <img src="/kabluka.png" width={88} height={25} alt="Kabluka" />
    </BrandLink>
  </footer>
);
