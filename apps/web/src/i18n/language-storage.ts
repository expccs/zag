import {
  DEFAULT_LANGUAGE,
  isLanguage,
  type Language,
} from './language-context';

const STORAGE_KEY = 'zag:lang:v1';

let cached: Language | null = null;

const readStored = (): Language | null => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isLanguage(stored) ? stored : null;
  } catch {
    return null;
  }
};

const detect = (): Language => {
  const tag = typeof navigator === 'undefined' ? '' : navigator.language;
  return tag.toLowerCase().startsWith('en') ? 'en' : DEFAULT_LANGUAGE;
};

/** Stored choice, else the browser language (UA unless English). */
export const loadLanguage = (): Language => {
  if (cached) return cached;
  cached = readStored() ?? detect();
  return cached;
};

export const saveLanguage = (language: Language): void => {
  cached = language;
  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // Private mode or storage disabled: the choice lives for this page only.
  }
};
