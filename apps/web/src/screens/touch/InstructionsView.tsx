import { Navigate, useParams } from 'react-router';
import { GlassLink } from '../../components/GlassLink';
import type { InstructionItem } from '../../i18n/messages';
import { useLanguage } from '../../i18n/use-language';
import { isEnabledMode, MODES_PATH, SOLE_MODE } from '../../interactive/modes';
import { TouchChrome } from './TouchChrome';
import styles from './instructions.module.css';

const renderItem = (item: InstructionItem, index: number) => (
  <p key={index} className={styles.paragraph}>
    {item.label ? <b className={styles.label}>{item.label}</b> : null}
    {item.label ? ' ' : null}
    {item.text}
  </p>
);

/**
 * «Інструкція» `34:4109` / `45:3236` / `45:3338` and ENG copies: h1, the
 * mode's mini card (design-system.md § 6.5), the text card (§ 5.2) and
 * «Продовжити» leading to the mode's setup.
 */
export const InstructionsView = () => {
  const { mode } = useParams();
  const { messages, language } = useLanguage();
  if (!isEnabledMode(mode)) return <Navigate to={MODES_PATH} replace />;
  const { title, cta, byMode } = messages.touch.instructions;
  const card = messages.touch.modes.cards.find((item) => item.mode === mode);
  const instruction = byMode[mode];
  return (
    <TouchChrome back={SOLE_MODE ? '/mission' : '/touch'}>
      <div className={styles.instructions} data-lang={language}>
        <h1 className={styles.title}>{title}</h1>
        {card ? (
          <div className={`glass-card ${styles.modeCard}`}>
            <img
              className={styles.preview}
              src={card.preview}
              alt={card.previewAlt}
              width={300}
              height={300}
            />
            <div className={styles.modeText}>
              <h2 className={styles.modeTitle}>{card.title}</h2>
              <p className={styles.modeBody}>{card.body}</p>
            </div>
          </div>
        ) : null}
        <div className={`glass-card ${styles.textCard}`}>
          <p className={`${styles.paragraph} ${styles.lead}`}>
            {instruction.lead}
          </p>
          {instruction.items.map(renderItem)}
          <p className={styles.paragraph}>{instruction.closing}</p>
        </div>
        <div className={styles.action}>
          <GlassLink variant="instruction" to={`/touch/${mode}/setup`}>
            {cta}
          </GlassLink>
        </div>
      </div>
    </TouchChrome>
  );
};

export default InstructionsView;
