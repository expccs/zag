import type { ReactNode } from 'react';
import type { Messages, Notice } from '../../i18n/messages';
import { useLanguage } from '../../i18n/use-language';
import styles from './notice.module.css';

type NoticeKind = {
  [K in keyof Messages['touch']]: Messages['touch'][K] extends Notice
    ? K
    : never;
}[keyof Messages['touch']];

export interface NoticeViewProps {
  kind: NoticeKind;
  children?: ReactNode;
}

/** Centred h3 + body (design-system.md type.h3 / type.body) and extras. */
export const NoticeView = ({ kind, children }: NoticeViewProps) => {
  const { messages } = useLanguage();
  const notice = messages.touch[kind];
  return (
    <div className={styles.notice}>
      <h2 className={styles.title}>{notice.title}</h2>
      <p className={styles.body}>{notice.body}</p>
      {children}
    </div>
  );
};
