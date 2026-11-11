import { NoticeView } from './NoticeView';
import styles from './notice.module.css';

/**
 * The unplugged-cable drawing of «Зв'язок втрачено» `47:3912`. The SVG
 * keeps its Figma frame (644 × 784 at 58.6 / 260.3), the drawing itself
 * sits inside the 393 column; the wrapper clips the rest.
 */
export const NoConnectionArt = () => (
  <div className={styles.art} aria-hidden="true">
    <img
      className={styles.artImage}
      src="/icons/no-connection.svg"
      alt=""
      width={644}
      height={784}
    />
  </div>
);

/** «Зв'язок втрачено» `47:3912`: notice + the drawing. */
export const ConnectionLostView = () => (
  <NoticeView kind="lost">
    <NoConnectionArt />
  </NoticeView>
);
