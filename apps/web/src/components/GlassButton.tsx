import type { ButtonHTMLAttributes } from 'react';
import type { GlassVariant } from './GlassLink';
import styles from './glass-link.module.css';

export interface GlassButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'className'
> {
  variant: GlassVariant;
}

/** Same pill as `GlassLink`, as a button for in-page actions. */
export const GlassButton = ({
  variant,
  children,
  type = 'button',
  ...rest
}: GlassButtonProps) => (
  <button
    type={type}
    className={`${styles.frame} ${styles.button} ${styles[variant]}`}
    {...rest}
  >
    <span className={`glass-pill ${styles.pill}`}>{children}</span>
  </button>
);
