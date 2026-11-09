import { BRUSH_WIDTHS } from '../../../interactive/modes';
import styles from './setup.module.css';

export interface WidthPickerProps {
  width: number;
  onChange: (width: number) => void;
}

/** Three stroke cards of `34:4171` (327 × 101, § 6.7). */
export const WidthPicker = ({ width, onChange }: WidthPickerProps) => (
  <div className={styles.options} role="radiogroup">
    {BRUSH_WIDTHS.map((brush, index) => (
      <button
        key={brush.icon}
        type="button"
        role="radio"
        aria-checked={index === width}
        className={`glass-card ${styles.option} ${styles.widthOption}`}
        onClick={() => onChange(index)}
      >
        <img
          src={brush.icon}
          alt=""
          width={brush.width}
          height={brush.height}
          style={{ width: `${brush.width / 16}rem` }}
        />
      </button>
    ))}
  </div>
);
