import { createContext } from 'react';
import type { Messages } from './messages';

export type Language = 'uk' | 'en';

export const LANGUAGES: readonly Language[] = ['uk', 'en'];

export const DEFAULT_LANGUAGE: Language = 'uk';

export const isLanguage = (value: unknown): value is Language =>
  typeof value === 'string' && LANGUAGES.includes(value as Language);

export interface LanguageContextValue {
  language: Language;
  /** Strings of the current language. */
  messages: Messages;
  setLanguage: (language: Language) => void;
  /** UA ↔ ENG, what the chevron pill on every screen does. */
  toggleLanguage: () => void;
}

export const LanguageContext = createContext<LanguageContextValue | null>(null);
