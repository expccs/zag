import type { ReactNode } from 'react';
import { BrandLink } from '../../../components/BrandLink';
import styles from './landscape.module.css';

export interface LandscapeBarProps {
  /** `countdown` (31:2523): Kabluka centred; `drawing` (29:2078): Expolight. */
  layout: 'countdown' | 'drawing';
  children?: ReactNode;
}

/**
 * Top strip of the landscape screens: ZAG short, two brand logos, extras.
 * Every logo links to its site (new tab, the session stays alive here).
 */
export const LandscapeBar = ({ layout, children }: LandscapeBarProps) => (
  <header className={`${styles.bar} ${styles[layout]}`}>
    <BrandLink brand="zag" className={styles.zag}>
      <img src="/zag-short.png" alt="ZAG" />
    </BrandLink>
    {layout === 'countdown' ? (
      <>
        <BrandLink brand="kabluka" className={styles.kabluka}>
          <img src="/kabluka.png" alt="Kabluka" />
        </BrandLink>
        <BrandLink brand="expolight" className={styles.expolight}>
          <img src="/expolight.png" alt="Expolight" />
        </BrandLink>
      </>
    ) : (
      <>
        <BrandLink brand="expolight" className={styles.expolight}>
          <img src="/expolight.png" alt="Expolight" />
        </BrandLink>
        <BrandLink brand="kabluka" className={styles.kabluka}>
          <img src="/kabluka.png" alt="Kabluka" />
        </BrandLink>
      </>
    )}
    {children}
  </header>
);
