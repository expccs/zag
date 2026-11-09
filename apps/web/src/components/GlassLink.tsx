import { Link, type LinkProps } from 'react-router';
import styles from './glass-link.module.css';

export type GlassVariant = 'home' | 'mission' | 'action' | 'instruction';

export interface GlassLinkProps extends Omit<LinkProps, 'className'> {
  /**
   * `home`: 295 × 48, fill 0; `mission`: 307 × 50; `action`: 273 × 44
   * («Почати»); `instruction`: 283 × 35 («Продовжити») — § 6.1.
   */
  variant: GlassVariant;
}

/** Action button of the design: a transparent frame with a glass pill. */
export const GlassLink = ({ variant, children, ...rest }: GlassLinkProps) => (
  <Link className={`${styles.frame} ${styles[variant]}`} {...rest}>
    <span className={`glass-pill ${styles.pill}`}>{children}</span>
  </Link>
);
