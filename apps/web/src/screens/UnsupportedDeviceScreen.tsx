import { BrandFooter } from '../components/BrandFooter';
import { LangSwitch } from '../components/LangSwitch';
import { ZagHeader } from '../components/ZagHeader';
import { useLanguage } from '../i18n/use-language';
import styles from './unsupported-device-screen.module.css';

/**
 * Tablet / desktop placeholder: the app is for a phone in front of the
 * facade. Not in Figma (design-system.md § 11); built from the Home
 * background, the logo strip, h3 + body of the notices and the footer.
 */
export const UnsupportedDeviceScreen = () => {
  const { messages } = useLanguage();
  const { title, body } = messages.device;
  return (
    <main className={styles.screen}>
      <div className={styles.column}>
        <div className={styles.header}>
          <ZagHeader />
        </div>
        <div className={styles.lang}>
          <LangSwitch size="home" />
        </div>
        <section className={styles.notice}>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.body}>{body}</p>
        </section>
        <BrandFooter />
      </div>
    </main>
  );
};
