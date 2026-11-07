import { BrandFooter } from '../components/BrandFooter';
import { GlassLink } from '../components/GlassLink';
import { LangSwitch } from '../components/LangSwitch';
import { ZagHeader } from '../components/ZagHeader';
import { useLanguage } from '../i18n/use-language';
import styles from './home-screen.module.css';

const version = import.meta.env.VITE_APP_VERSION || 'dev';

/** Home `8:3824` / `11:4392`: facade photo, hero title, one button. */
export const HomeScreen = () => {
  const { messages } = useLanguage();
  return (
    <main className={styles.screen}>
      <div className={styles.column}>
        <ZagHeader />
        <div className={styles.lang}>
          <LangSwitch size="home" />
        </div>
        <section className={styles.hero}>
          <h1 className={styles.title}>{messages.home.title}</h1>
          <GlassLink variant="home" to="/mission">
            {messages.home.mission}
          </GlassLink>
        </section>
        <BrandFooter />
        <p className={styles.version}>{version.slice(0, 7)}</p>
      </div>
    </main>
  );
};
