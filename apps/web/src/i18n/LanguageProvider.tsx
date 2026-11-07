import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { LanguageContext, type Language } from './language-context';
import { loadLanguage, saveLanguage } from './language-storage';
import { MESSAGES } from './messages';

export interface LanguageProviderProps {
  /** Overrides the stored / detected language (tests, previews). */
  initial?: Language;
  children: ReactNode;
}

export const LanguageProvider = ({
  initial,
  children,
}: LanguageProviderProps) => {
  const [language, setState] = useState<Language>(
    () => initial ?? loadLanguage(),
  );

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback((next: Language) => {
    saveLanguage(next);
    setState(next);
  }, []);

  const toggleLanguage = useCallback(() => {
    setState((current) => {
      const next: Language = current === 'uk' ? 'en' : 'uk';
      saveLanguage(next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      language,
      messages: MESSAGES[language],
      setLanguage,
      toggleLanguage,
    }),
    [language, setLanguage, toggleLanguage],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};
