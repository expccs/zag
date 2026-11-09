import { useLanguage } from '../../../i18n/use-language';
import { TouchChrome } from '../TouchChrome';
import styles from './session.module.css';

/** «Ти чудово впорався!» `38:2770` / `89:1596`; the arrow goes to the modes. */
export const FinalView = () => {
  const { messages } = useLanguage();
  const { title, body } = messages.touch.final;
  return (
    <TouchChrome back="/touch" footer="solo">
      <div className={styles.final}>
        <h1 className={styles.finalTitle}>{title}</h1>
        <p className={styles.finalBody}>{body}</p>
      </div>
    </TouchChrome>
  );
};
