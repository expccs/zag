import type { ReactNode } from 'react';
import styles from './landscape.module.css';

export interface LandscapeBarProps {
  /** `countdown` (31:2523): Kabluka centred; `drawing` (29:2078): Expolight. */
  layout: 'countdown' | 'drawing';
  children?: ReactNode;
}

/** Top strip of the landscape screens: ZAG short, two brand logos, extras. */
export const LandscapeBar = ({ layout, children }: LandscapeBarProps) => (
  <header className={`${styles.bar} ${styles[layout]}`}>
    <img className={styles.zag} src="/zag-short.png" alt="ZAG" />
    {layout === 'countdown' ? (
      <>
        <img className={styles.kabluka} src="/kabluka.png" alt="Kabluka" />
        <img
          className={styles.expolight}
          src="/expolight.png"
          alt="Expolight"
        />
      </>
    ) : (
      <>
        <img
          className={styles.expolight}
          src="/expolight.png"
          alt="Expolight"
        />
        <img className={styles.kabluka} src="/kabluka.png" alt="Kabluka" />
      </>
    )}
    {children}
  </header>
);
