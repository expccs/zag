/**
 * UI strings per language, copied from Figma «Додаток ZAG»:
 * Home UA `8:3824`, Home EN `11:4392` («Create / with Light»),
 * Mission UA `8:146` (body in Ukrainian, title left in English by the
 * designer), Mission ENG `38:3029`. Titles carry the frame's line break;
 * `gap` blocks reproduce the empty lines of the Figma text layer.
 */
import type { Language } from './language-context';

export type Inline = string | { bold: string };

export type Block =
  | { type: 'paragraph'; content: Inline[] }
  | { type: 'list'; items: string[] }
  | { type: 'gap'; lines: number };

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
    title: 'Створюй\nсвітлом',
    mission: 'Місія та філософія',
  },
  mission: {
    title: 'Mission\n& Philosophy',
    heroAlt: 'Фасад Zenyk Art Gallery вночі',
    body: [
      {
        type: 'paragraph',
        content: [
          'Назва розшифровується як Zenyk Art Gallery і має глибоке ',
          'символічне значення. Галерея започаткована засновником ',
          { bold: '«Благодійного фонду Козицького»' },
          ' Козицьким Зіновієм Ярославовичем та мистецького виставкового ',
          'проєкту «Ми і світ», що з початку повномасштабного вторгнення ',
          'займається промоцією українського мистецтва на світовій арені. ',
          'На сьогодні він організував понад 50 мистецьких проєктів у 17 ',
          'країнах.',
        ],
      },
      { type: 'gap', lines: 1 },
      {
        type: 'paragraph',
        content: [
          'ZENYK ART GALLERY названа та присвячена світлій памʼяті його ',
          'онука – Зеника Козицького Молодшого.',
        ],
      },
      { type: 'gap', lines: 2 },
      {
        type: 'paragraph',
        content: [
          { bold: 'ZENYK ART GALLERY' },
          ' – це перший в Україні безбар’єрний мистецький простір, ',
          'створений за міжнародними стандартами доступності.',
        ],
      },
      { type: 'paragraph', content: ['Важливі ініціативи:'] },
      {
        type: 'list',
        items: [
          'Освітні мистецькі події для дітей та молоді.',
          'Арт-терапії для ветеранів та соціально вразливих груп.',
          'Пільгові та безкоштовні квитки для соціально незахищених верств населення.',
          'Інформаційні панелі з брайлівським шрифтом, аудіогіди, відео із субтитрами.',
          'Простори, адаптовані для відвідувачів на кріслах колісних та з протезами.',
        ],
      },
      { type: 'gap', lines: 1 },
      {
        type: 'paragraph',
        content: [{ bold: 'ZENYK ART GALLERY поєднуватиме' }, ':'],
      },
      {
        type: 'list',
        items: [
          'Виставкові зали, створені за технічними стандартами світових музеїв.',
          'Арт-крамницю українських брендів, яка підтримуватиме крафтових митців.',
          'Книжкову зону з добірками мистецької літератури.',
          '3D-зону для інтерактивних експозицій.',
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
    title: 'Create\nwith Light',
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
