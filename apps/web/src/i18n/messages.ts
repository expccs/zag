/**
 * UI strings per language, copied from Figma «Додаток ZAG»:
 * Home UA `8:3824`, Home EN `11:4392` («Create / with Light»),
 * Mission UA `8:146` (body in Ukrainian, title left in English by the
 * designer), Mission ENG `38:3029`. Titles carry the frame's line break;
 * `gap` blocks reproduce the empty lines of the Figma text layer.
 */
import type { InteractiveMode } from '@zag/protocol';
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

/** Centred h3 + body of the Touch & Create notices (`45:3440`, `45:3600`). */
export interface Notice {
  title: string;
  body: string;
}

export interface ModeCard {
  mode: InteractiveMode;
  title: string;
  body: string;
  preview: string;
  previewAlt: string;
}

/** One paragraph of the instruction card; `label` is the bold lead-in. */
export interface InstructionItem {
  label?: string;
  text: string;
}

/** Text card of «Інструкція» (`45:3236` etc.): bold lead, items, closing. */
export interface Instruction {
  lead: string;
  items: InstructionItem[];
  closing: string;
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
  touch: {
    /** First connection in progress. Not in Figma, wording is ours. */
    connecting: Notice;
    /** `45:3440` / `47:3912` — also used while reconnecting. */
    lost: Notice;
    /** `screen: 'maintenance'`. Not in Figma (design-system.md § 11). */
    maintenance: Notice;
    /** `screen: 'disabled'`. Not in Figma. */
    disabled: Notice;
    /** `45:3600` / `47:4007`: «з 18:00 до 22:00». */
    schedule: Notice & { from: string; to: string };
    /** `26:1957` / `47:4183`. */
    modes: { title: string; cards: ModeCard[] };
    /** Comet `45:3236` / `47:4579`, Milky Way `47:4889` / `34:4109`, Palette
     *  `45:3338` / `47:5394`. */
    instructions: {
      title: string;
      cta: string;
      byMode: Record<InteractiveMode, Instruction>;
    };
    /** `31:2237` / `34:4171` / `38:2192` and their ENG copies. */
    setup: {
      color: string;
      width: string;
      palette: string;
      start: string;
      /** Request failed for a reason other than the screen; ours. */
      failed: string;
    };
    /** `34:2820` / `47:3825`: h3 + body above the ring. */
    queue: Notice;
    /** `89:1852` / `89:1915` (portrait), `31:2523` / `84:3543` (landscape). */
    fade: {
      title: string;
      titleLandscape: string;
      rotate: string;
      hint: string;
    };
    /** `29:2078` / `47:5943`: «Таймер: 00:31». */
    drawing: { timer: string };
    /** `38:2770` / `89:1596`. */
    final: { title: string; body: string };
  };
}

/**
 * Facade hours shown on the schedule notice. The protocol carries only the
 * `schedule` flag, not the hours (shared-modules.md § 4); until it does the
 * values come from the Figma frame.
 */
export const SCHEDULE_HOURS = { open: '18:00', close: '22:00' } as const;

const PREVIEWS: Record<InteractiveMode, string> = {
  comet: '/modes/comet.jpg',
  'milky-way': '/modes/milky-way.jpg',
  palette: '/modes/palette.jpg',
};

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
  touch: {
    connecting: {
      title: 'Зачекайте будь-ласка!',
      body: 'Підключаємось до фасаду…',
    },
    lost: {
      title: "Зв'язок втрачено",
      body:
        'Ви знаходитесь поза зоною дії. Будь ласка, підійдіть ближче до ' +
        'будівлі, щоб підключитися знову.',
    },
    maintenance: {
      title: 'Технічна перерва',
      body:
        'Фасад тимчасово недоступний. Ми вже працюємо над цим, спробуйте ' +
        'трохи пізніше.',
    },
    disabled: {
      title: 'Інтерактив вимкнено',
      body: 'Керування фасадом зараз недоступне. Завітайте іншим разом.',
    },
    schedule: {
      title: 'Графік роботи',
      body:
        'Щоб ви могли насолодитися малюнками у всій красі, ми вмикаємо ' +
        'керування фасадом лише з настанням темряви.',
      from: 'з',
      to: 'до',
    },
    modes: {
      title: 'Режими',
      cards: [
        {
          mode: 'comet',
          preview: PREVIEWS.comet,
          title: 'Комета',
          body:
            'Кожен ваш жест запускає на фасаді яскраву комету. Лінії не ' +
            'залишаються статичними — вони ефектно спалахують у точці дотику ' +
            'і красиво згасають, залишаючи сяючий слід. Жодних меж для ' +
            'фантазії: малюйте динамічні візерунки, які змінюються щосекунди!',
          previewAlt: 'Комета на нічному небі',
        },
        {
          mode: 'milky-way',
          preview: PREVIEWS['milky-way'],
          title: 'Чумацький шлях',
          body:
            'Створи власну яскраву галактику! Обери товщину пензля перед ' +
            'стартом, а далі — просто малюй. Кожен твій рух автоматично ' +
            'наповнюватиметься новими, випадковими кольорами, перетворюючи ' +
            'екран на справжнє зоряне скупчення.',
          previewAlt: 'Галактика',
        },
        {
          mode: 'palette',
          preview: PREVIEWS.palette,
          title: 'Палітра',
          body:
            'Керуйте кольором та створюйте продумані шедеври! У цьому режимі ' +
            'ви не просто малюєте — ви граєте з гармонією. Обери свій настрій ' +
            "серед чотирьох унікальних палітр, але пам'ятай: кожна нова лінія " +
            'змінює всю картину. Готові до творчого виклику?',
          previewAlt: 'Кольорові смуги',
        },
      ],
    },
    instructions: {
      title: 'Інструкція',
      cta: 'Продовжити',
      byMode: {
        comet: {
          lead: 'Запускайте власну зірку в режимі “Комета”!',
          items: [
            {
              label: 'Ваш колір та рух:',
              text:
                'Оберіть бажаний відтінок і створюйте світлові лінії прямо ' +
                'на фасаді.',
            },
            {
              label: 'Ефект комети:',
              text:
                'Ваш пензель не просто малює — він має яскравий сяючий ' +
                'епіцентр та розкішний кольоровий шлейф, що тягнеться за ' +
                'кожним рухом.',
            },
            {
              label: 'Жива абстракція:',
              text:
                'Малюнки не застигають на матриці. Вони плавно розчиняються ' +
                'в темряві за 2-3 секунди, створюючи безперервну та динамічну ' +
                'гру світла.',
            },
          ],
          closing:
            'Насолоджуйтесь власним світловим витвіром та фотографуйте ' +
            'впродовж 40 секунд, поки триватиме ваша черга.',
        },
        'milky-way': {
          lead: 'Створюйте сяючі шедеври в режимі “Чумацький шлях”!',
          items: [
            {
              label: 'Магія кольору:',
              text:
                'Кожен ваш рух автоматично забарвлюється в нові яскраві ' +
                'відтінки.',
            },
            {
              label: 'Повний контроль:',
              text:
                'Керуйте своїм «світловим пензлем». Обравши товщину пензля ' +
                'перед початком.',
            },
            {
              label: 'Ефект падаючої зірки:',
              text:
                'Ваші малюнки не статичні. Вони плавно слідують за вами та ' +
                'красиво розчиняються в просторі, створюючи безперервне ' +
                'світлове шоу.',
            },
          ],
          closing:
            'Насолоджуйтесь власним світловим витвіром та фотографуйте ' +
            'впродовж 40 секунд, поки триватиме ваша черга.',
        },
        palette: {
          lead: 'Створюйте продумані композиції в режимі «Палітра»!',
          items: [
            {
              label: 'Магія чотирьох палітр:',
              text:
                'Оберіть одну з 4 доступних колірних комбінацій, які будуть ' +
                'циклічно повторюватись. Кожна ваша нова лінія автоматично ' +
                'забарвлюватиметься в наступний відтінок з обраної вами ' +
                'палітри.',
            },
            {
              label: 'Правило двох ліній:',
              text:
                'Намалюйте першу лінію, потім відірвіть палець і створіть ' +
                'другу. Але будьте уважні: щойно ви торкнетеся екрана втретє, ' +
                'ваша найперша лінія миттєво зникне! На фасаді одночасно ' +
                'можуть світитися лише два штрихи.',
            },
            {
              label: 'Безперервне оновлення:',
              text:
                'Кожна нова дія витісняє першу лінію. Це перетворює ' +
                'малювання на захопливий творчий процес, де композиція не ' +
                'стоїть на місці, а постійно живе та змінюється разом із ' +
                'вашими рухами.',
            },
          ],
          closing:
            'Насолоджуйтесь власним світловим витвіром та фотографуйте ' +
            'впродовж 40 секунд, поки триватиме ваша черга.',
        },
      },
    },
    setup: {
      color: 'Обери колір',
      width: 'Обери ширину',
      palette: 'Обери палітру',
      start: 'Почати',
      failed: 'Не вдалося надіслати запит. Спробуйте ще раз.',
    },
    queue: {
      title: 'Зачекайте будь-ласка!',
      body: 'Після завершення таймеру настане ваша черга.',
    },
    fade: {
      title: 'Початок через',
      titleLandscape: 'Початок через',
      rotate: 'Переверніть смартфон в горизонтальне положення.',
      hint:
        'Рухайте пальцем по зображенню фасаду, і світло вашого доторку ' +
        'проявиться на фасаді в реальному часі.',
    },
    drawing: { timer: 'Таймер' },
    final: {
      title: 'Ти чудово\nвпорався!',
      body:
        'Знімайте фото та відео! Кожен ваш малюнок унікальний. Збережіть ' +
        'своє персональне світлове шоу на камеру! Чекаємо відгуки у ' +
        'соц-мережах',
    },
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
  touch: {
    connecting: {
      title: 'Please wait!',
      body: 'Connecting to the facade…',
    },
    lost: {
      title: 'Connection lost',
      body:
        'You are out of range. Please move closer to the building to ' +
        'reconnect.',
    },
    maintenance: {
      title: 'Maintenance break',
      body:
        'The facade is temporarily unavailable. We are already working on ' +
        'it, please try again a bit later.',
    },
    disabled: {
      title: 'Interactive is off',
      body: 'Facade control is unavailable right now. Please come back later.',
    },
    schedule: {
      title: 'Operating hours',
      body:
        'To enjoy the artwork in all its beauty, you can control the facade ' +
        'only after dark.',
      from: 'from',
      to: 'to',
    },
    modes: {
      title: 'Modes',
      cards: [
        {
          mode: 'comet',
          preview: PREVIEWS.comet,
          title: 'Comet',
          body:
            'Every gesture launches a bright comet across the facade. Lines ' +
            "don't stay still — they flare at your touch and gently fade, " +
            'leaving a glowing trail. Let your imagination run free: draw ' +
            'dynamic patterns that change every second!',
          previewAlt: 'Comet in the night sky',
        },
        {
          mode: 'milky-way',
          preview: PREVIEWS['milky-way'],
          title: 'Milky Way',
          body:
            'Create your own vibrant galaxy! Choose your brush size before ' +
            'you start, then just draw. Each stroke automatically fills with ' +
            'new, random colors, turning the screen into a dazzling cluster ' +
            'of stars.',
          previewAlt: 'Galaxy',
        },
        {
          mode: 'palette',
          preview: PREVIEWS.palette,
          title: 'Palette',
          body:
            'Master color and create thoughtful masterpieces! In this mode, ' +
            "you don't just draw — you play with harmony. Set the mood with " +
            'one of four unique palettes, but remember: each new line ' +
            'changes the whole picture. Ready for a creative challenge?',
          previewAlt: 'Colour stripes',
        },
      ],
    },
    instructions: {
      title: 'Instructions',
      cta: 'Continue',
      byMode: {
        comet: {
          lead: 'Launch your own star in “Comet” mode!',
          items: [
            {
              label: 'Your color and movement:',
              text:
                'Choose your favorite shade and draw lines of light directly ' +
                'on the facade.',
            },
            {
              label: 'The comet effect:',
              text:
                'Your brush does more than draw — it has a bright, glowing ' +
                'core and a vibrant trail of color that follows your every ' +
                'move.',
            },
            {
              label: 'Living abstraction:',
              text:
                'Your drawings don’t stay frozen on the display. They gently ' +
                'fade into the darkness in 2–3 seconds, creating a ' +
                'continuous, dynamic play of light.',
            },
          ],
          closing:
            'Enjoy your own light creation and take photos during your ' +
            '40-second turn.',
        },
        'milky-way': {
          lead: 'Create glowing masterpieces in “Milky Way” mode!',
          items: [
            {
              label: 'Full control:',
              text:
                'Take charge of your “light brush”. Choose your brush ' +
                'thickness before you begin.',
            },
            {
              label: 'Color magic:',
              text: 'Every movement automatically takes on new, vibrant hues.',
            },
            { text: 'Create your own composition' },
          ],
          closing:
            'Enjoy your light creation and take photos during your ' +
            '40-second turn.',
        },
        palette: {
          lead: 'Create thoughtful compositions in Palette mode!',
          items: [
            {
              label: 'The magic of four palettes:',
              text:
                'Choose one of 4 available color combinations. Each new line ' +
                'automatically takes on the next shade in your chosen palette.',
            },
            {
              label: 'The two-line rule:',
              text:
                'Draw your first line, then lift your finger and draw a ' +
                'second. But be careful: as soon as you touch the screen a ' +
                'third time, your first line instantly disappears! Only two ' +
                'strokes can glow on the façade at once.',
            },
            {
              label: 'Constant renewal:',
              text:
                'Each new action replaces the oldest line. This turns drawing ' +
                'into an exciting creative process: your composition never ' +
                'stands still, but keeps evolving with your movements.',
            },
          ],
          closing:
            'Enjoy your own light creation and take photos during your ' +
            '40-second turn.',
        },
      },
    },
    setup: {
      color: 'Choose a color',
      width: 'Choose width',
      palette: 'Choose a palette',
      start: 'Start',
      failed: 'Could not send the request. Please try again.',
    },
    queue: {
      title: 'Please wait!',
      body: 'It will be your turn when the timer ends.',
    },
    fade: {
      title: 'Starting in',
      titleLandscape: 'Starts in',
      rotate: 'Turn your smartphone to landscape mode.',
      hint:
        'Move your finger across the façade image and watch your touch ' +
        'light up the façade in real time.',
    },
    drawing: { timer: 'Timer' },
    final: {
      title: 'You did\ngreat!',
      body:
        'Take photos and videos! Every drawing is unique. Capture your ' +
        'personal light show on camera! Share your feedback on social media.',
    },
  },
};

export const MISSION_HERO = PHOTOS.hero;

export const MESSAGES: Readonly<Record<Language, Messages>> = { uk, en };
