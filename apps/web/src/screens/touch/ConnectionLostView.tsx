import { NoticeView } from './NoticeView';
import styles from './notice.module.css';

/**
 * «Зв'язок втрачено» `47:3912`: notice + the unplugged-cable drawing.
 * The SVG keeps its Figma frame (644 × 784 at 58.6 / 260.3), the drawing
 * itself sits inside the 393 column; the wrapper clips the rest.
 */
export const ConnectionLostView = () => (
  <NoticeView kind="lost">
    <div className={styles.art} aria-hidden="true">
      <img
        className={styles.artImage}
        src="/icons/no-connection.svg"
        alt=""
        width={644}
        height={784}
      />
    </div>
  </NoticeView>
);
