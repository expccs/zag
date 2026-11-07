import { useEffect } from 'react';
import { BackLink } from '../components/BackLink';
import { BrandFooter } from '../components/BrandFooter';
import { GlassLink } from '../components/GlassLink';
import { LangSwitch } from '../components/LangSwitch';
import { ZagHeader } from '../components/ZagHeader';
import { MISSION_HERO, type Block, type Inline } from '../i18n/messages';
import { useLanguage } from '../i18n/use-language';
import styles from './mission-screen.module.css';

const renderInline = (part: Inline, index: number) =>
  typeof part === 'string' ? part : <b key={index}>{part.bold}</b>;

const renderBlock = (block: Block, index: number) => {
  if (block.type === 'gap') {
    return (
      <div
        key={index}
        className={styles.gap}
        style={{ height: `${block.lines}lh` }}
        aria-hidden="true"
      />
    );
  }
  if (block.type === 'list') {
    return (
      <ul key={index} className={styles.list}>
        {block.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    );
  }
  return (
    <p key={index} className={styles.paragraph}>
      {block.content.map(renderInline)}
    </p>
  );
};

/**
 * Mission & Philosophy `38:3029`, 395 × 2307 (design-system.md § 8).
 * Backgrounds and photos bleed to the viewport edges; text, nav and the
 * button stay in the centred 393 column.
 */
const MissionScreen = () => {
  const { messages } = useLanguage();
  const { mission } = messages;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <main className={styles.screen}>
      <div className={styles.top}>
        <div className={styles.column}>
          <ZagHeader />
          <nav className={styles.nav}>
            <BackLink to="/" />
            <LangSwitch size="home" />
          </nav>
        </div>
        <section className={styles.hero}>
          <img
            className={styles.heroPhoto}
            src={MISSION_HERO}
            alt={mission.heroAlt}
            width={1000}
            height={666}
            fetchPriority="high"
          />
          <h1 className={styles.title}>{mission.title}</h1>
        </section>
        <article className={`${styles.column} ${styles.body}`}>
          {mission.body.map(renderBlock)}
        </article>
      </div>
      <div className={styles.photos}>
        {mission.photos.map((photo) => (
          <img
            key={photo.src}
            className={styles.photo}
            src={photo.src}
            alt={photo.alt}
            width={1000}
            height={666}
            loading="lazy"
          />
        ))}
      </div>
      <div className={styles.cta}>
        <GlassLink variant="mission" to="/">
          {mission.cta}
        </GlassLink>
      </div>
      <div className={styles.footer}>
        <BrandFooter />
      </div>
    </main>
  );
};

export default MissionScreen;
