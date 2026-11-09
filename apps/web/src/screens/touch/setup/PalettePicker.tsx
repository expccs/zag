import { PALETTES } from '../../../interactive/modes';
import styles from './setup.module.css';

export interface PalettePickerProps {
  palette: number;
  onChange: (palette: number) => void;
}

/** Four palette cards of `38:2192` (307 × 114, stripe 270 × 83, § 2). */
export const PalettePicker = ({ palette, onChange }: PalettePickerProps) => (
  <div className={styles.options} role="radiogroup">
    {PALETTES.map((colors, index) => (
      <button
        key={colors.join()}
        type="button"
        role="radio"
        aria-checked={index === palette}
        className={`glass-card ${styles.option} ${styles.paletteOption}`}
        onClick={() => onChange(index)}
      >
        <span className={styles.stripe}>
          {colors.map((color) => (
            <span key={color} style={{ background: color }} />
          ))}
        </span>
      </button>
    ))}
  </div>
);
