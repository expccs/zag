/**
 * UI strings per language. Source: Figma «Додаток ZAG» — Home UA `8:3824`,
 * Home EN `11:4392`, Mission & Philosophy ENG `38:3029`. There is no UA
 * frame for Mission; its Ukrainian text is a translation of the ENG frame.
 */
import type { Language } from './language-context';

export type Inline = string | { bold: string };

export type Block =
  { type: 'paragraph'; content: Inline[] } | { type: 'list'; items: string[] };

export interface MissionPhoto {
  src: string;
  alt: string;
}

export interface Messages {
  /** Label inside the language pill: the current language. */
  langLabel: string;
  langSwitchHint: string;
  back: string;
  home: {
    title: string;
    mission: string;
  };
  mission: {
    title: string;
    heroAlt: string;
    body: Block[];
    photos: MissionPhoto[];
    cta: string;
  };
}

const PHOTOS = {
  hero: '/mission/facade-night-front.jpg',
  facade: '/mission/facade-night-angle.jpg',
  gallery: '/mission/gallery-interior.jpg',
  exhibit: '/mission/exhibit-immersive.jpg',
} as const;

const uk: Messages = {
  langLabel: 'UA',
  langSwitchHint: 'Switch to English',
  back: 'Назад',
  home: {
    title: 'Створюй світлом',
    mission: 'Місія та філософія',
  },
  mission: {
    title: 'Місія\nта філософія',
    heroAlt: 'Фасад Zenyk Art Gallery вночі',
    body: [
      {
        type: 'paragraph',
        content: [
          'Назва означає Zenyk Art Gallery і має глибокий символічний зміст. ',
          'Галерею заснував ',
          { bold: 'Зіновій Ярославович Козицький' },
          ', засновник «Благодійного фонду Козицьких» та мистецького ',
          'виставкового проєкту «Ми і світ», який від початку ',
          'повномасштабного вторгнення популяризує українське мистецтво ',
          'на світовій сцені. На сьогодні він організував понад 50 ',
          'мистецьких проєктів у 17 країнах.',
        ],
      },
      {
        type: 'paragraph',
        content: [
          { bold: 'ZENYK ART GALLERY' },
          ' названа на честь і присвячена світлій пам’яті його онука, ',
          'Зеника Козицького-молодшого.',
        ],
      },
      {
        type: 'paragraph',
        content: [
          'ZENYK ART GALLERY — перший безбар’єрний мистецький простір в ',
          'Україні, створений за міжнародними стандартами доступності.',
        ],
      },
      { type: 'paragraph', content: ['Важливі ініціативи:'] },
      {
        type: 'list',
        items: [
          'Освітні мистецькі події для дітей та молоді.',
          'Арт-терапія для ветеранів і соціально вразливих груп.',
          'Пільгові та безкоштовні квитки для соціально незахищених верств населення.',
          'Інформаційні панелі шрифтом Брайля, аудіогіди та відео із субтитрами.',
          'Простори, пристосовані для відвідувачів на кріслах колісних і з протезами.',
        ],
      },
      {
        type: 'paragraph',
        content: [{ bold: 'У ZENYK ART GALLERY будуть:' }],
      },
      {
        type: 'list',
        items: [
          'Виставкові зали, створені за технічними стандартами музеїв світового рівня.',
          'Арт-шоп українських брендів на підтримку крафтових митців.',
          'Книжкова зона з добірками мистецької літератури.',
          '3D-зона для інтерактивних виставок.',
          'Освітні та мистецькі події для різних вікових груп.',
        ],
      },
    ],
    photos: [
      { src: PHOTOS.facade, alt: 'Фасад галереї з підсвіткою, вид збоку' },
      { src: PHOTOS.gallery, alt: 'Виставкова зала галереї' },
      { src: PHOTOS.exhibit, alt: 'Імерсивна інсталяція' },
    ],
    cta: 'Доторкнись і твори',
  },
};

const en: Messages = {
  langLabel: 'ENG',
  langSwitchHint: 'Перемкнути на українську',
  back: 'Back',
  home: {
    title: 'Create with light',
    mission: 'Mission & Philosophy',
  },
  mission: {
    title: 'Mission\n& Philosophy',
    heroAlt: 'Zenyk Art Gallery facade at night',
    body: [
      {
        type: 'paragraph',
        content: [
          'The name stands for Zenyk Art Gallery and holds a deep symbolic ',
          'meaning. The gallery was founded by ',
          { bold: 'Zinoviy Yaroslavovych Kozytskyi' },
          ', founder of the "Kozytskyi Charity Foundation" and the "We and ',
          'World" art exhibition project, which has been promoting Ukrainian ',
          'art on the global stage since the beginning of the full-scale ',
          'invasion. To date, he has organized over 50 art projects in 17 ',
          'countries.',
        ],
      },
      {
        type: 'paragraph',
        content: [
          { bold: 'ZENYK ART GALLERY' },
          ' is named after and dedicated to the bright memory of his ',
          'grandson, Zenyk Kozytskyi Jr.',
        ],
      },
      {
        type: 'paragraph',
        content: [
          'ZENYK ART GALLERY is the first barrier-free art space in Ukraine, ',
          'created according to international accessibility standards.',
        ],
      },
      { type: 'paragraph', content: ['Important initiatives:'] },
      {
        type: 'list',
        items: [
          'Educational art events for children and youth.',
          'Art therapy for veterans and socially vulnerable groups.',
          'Discounted and free tickets for socially unprotected segments of the population.',
          'Braille information panels, audio guides, and videos with subtitles.',
          'Spaces adapted for visitors in wheelchairs and those with prostheses.',
        ],
      },
      {
        type: 'paragraph',
        content: [{ bold: 'ZENYK ART GALLERY will feature:' }],
      },
      {
        type: 'list',
        items: [
          'Exhibition halls created according to the technical standards of world-class museums.',
          'An art shop of Ukrainian brands that will support craft artists.',
          'A book zone with selections of art literature.',
          'A 3D zone for interactive exhibitions.',
          'Educational and art events for various age groups.',
        ],
      },
    ],
    photos: [
      { src: PHOTOS.facade, alt: 'Illuminated gallery facade, side view' },
      { src: PHOTOS.gallery, alt: 'Exhibition hall of the gallery' },
      { src: PHOTOS.exhibit, alt: 'Immersive installation' },
    ],
    cta: 'Touch & Create',
  },
};

export const MISSION_HERO = PHOTOS.hero;

export const MESSAGES: Readonly<Record<Language, Messages>> = { uk, en };
