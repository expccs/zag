import type { ReactNode } from 'react';
import { BackLink } from '../../components/BackLink';
import { BrandFooter } from '../../components/BrandFooter';
import { BrandLink } from '../../components/BrandLink';
import { LangSwitch } from '../../components/LangSwitch';
import { ZagHeader } from '../../components/ZagHeader';
import styles from './touch-chrome.module.css';

export interface TouchChromeProps {
  /** Where the arrow leads: a route, or an action such as leaving the queue. */
  back: string | (() => void);
  /** `solo`: only the Expolight logo (final screen `38:2770`). */
  footer?: 'brands' | 'solo';
  children: ReactNode;
}

/**
 * Portrait frame shared by the Touch & Create screens: logo strip, back
 * arrow, language pill, the screen's content and the brand footer.
 */
export const TouchChrome = ({
  back,
  footer = 'brands',
  children,
}: TouchChromeProps) => (
  <main className={styles.screen}>
    <div className={styles.column}>
      <ZagHeader />
      <nav className={styles.nav}>
        <BackLink to={back} />
        <div className={styles.lang}>
          <LangSwitch size="home" />
        </div>
      </nav>
      <section className={styles.content} aria-live="polite">
        {children}
      </section>
      {footer === 'brands' ? (
        <BrandFooter />
      ) : (
        <footer className={styles.footerSolo}>
          <BrandLink brand="expolight">
            <img src="/expolight.png" width={138} height={38} alt="Expolight" />
          </BrandLink>
        </footer>
      )}
    </div>
  </main>
);
