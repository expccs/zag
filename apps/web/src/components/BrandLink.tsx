import type { ReactNode } from 'react';

/** The sites behind the logos. */
export const BRAND_URLS = {
  zag: 'https://zag.com.ua/',
  expolight: 'https://expolight.net/uk',
  kabluka: 'https://www.kabluka.art/',
} as const;

export type Brand = keyof typeof BRAND_URLS;

export interface BrandLinkProps {
  brand: Brand;
  className?: string;
  children: ReactNode;
}

/**
 * A logo that opens the partner's site in a new tab: the session (socket,
 * queue place) stays alive in this one. From the installed PWA the link
 * opens in the system browser.
 */
export const BrandLink = ({ brand, className, children }: BrandLinkProps) => (
  <a
    href={BRAND_URLS[brand]}
    target="_blank"
    rel="noopener noreferrer"
    className={className}
  >
    {children}
  </a>
);
