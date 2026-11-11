import { BrandFooter } from '../components/BrandFooter';
import { GlassLink } from '../components/GlassLink';
import { LangSwitch } from '../components/LangSwitch';
import { ZagHeader } from '../components/ZagHeader';
import { useLanguage } from '../i18n/use-language';
import { MODES_PATH } from '../interactive/modes';
import styles from './home-screen.module.css';

const version = import.meta.env.VITE_APP_VERSION || 'dev';

/**
 * Home `8:3824` / `11:4392`: facade photo, hero title, two buttons —
 * «Місія та філософія» and «Доторкнись і твори» (the interactive).
 */
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
          <div className={styles.actions}>
            <GlassLink variant="home" to="/mission">
              {messages.home.mission}
            </GlassLink>
            <GlassLink variant="home" to={MODES_PATH}>
              {messages.home.touch}
            </GlassLink>
          </div>
        </section>
        <BrandFooter />
        <p className={styles.version}>{version.slice(0, 7)}</p>
      </div>
    </main>
  );
};
