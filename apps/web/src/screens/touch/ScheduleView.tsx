import { SCHEDULE_HOURS } from '../../i18n/messages';
import { useLanguage } from '../../i18n/use-language';
import { NoticeView } from './NoticeView';
import styles from './notice.module.css';

/** «Графік роботи» `45:3600` / `47:4007`: notice + «з 18:00 до 22:00». */
export const ScheduleView = () => {
  const { messages } = useLanguage();
  const { from, to } = messages.touch.schedule;
  return (
    <NoticeView kind="schedule">
      <p className={styles.hours}>
        <span className={styles.prep}>{from}</span>
        <time className={styles.time}>{SCHEDULE_HOURS.open}</time>
        <span className={`${styles.prep} ${styles.prepTo}`}>{to}</span>
        <time className={`${styles.time} ${styles.timeTo}`}>
          {SCHEDULE_HOURS.close}
        </time>
      </p>
    </NoticeView>
  );
};
