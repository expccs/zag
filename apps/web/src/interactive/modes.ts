import type { InteractiveMode, SessionRequest } from '@zag/protocol';

/** What the user picks before a session (design-system.md § 6.6–6.7, § 2). */
export type SetupKind = 'color' | 'width' | 'palette';

export const SETUP_KIND: Readonly<Record<InteractiveMode, SetupKind>> = {
  comet: 'color',
  'milky-way': 'width',
  palette: 'palette',
};

export type Setup =
  | { kind: 'color'; color: string }
  | { kind: 'width'; width: number }
  | { kind: 'palette'; palette: number };

/** Four palettes of `38:2192`, three stripes each, in screen order. */
export const PALETTES: readonly (readonly [string, string, string])[] = [
  ['#2C45E6', '#62D5FF', '#9B2AFF'],
  ['#F9FF46', '#1B8700', '#9DF200'],
  ['#FF4848', '#FF9F3F', '#FFFF2F'],
  ['#9D2CFF', '#FF5CE1', '#F300B6'],
];

export interface BrushWidth {
  /** Stroke drawing of `34:4171`, exported from Figma. */
  icon: string;
  /** Intrinsic size of the SVG. */
  width: number;
  height: number;
  /** Line width of the local preview, px at 1rem = 16px. */
  linePx: number;
}

export const BRUSH_WIDTHS: readonly BrushWidth[] = [
  { icon: '/icons/brush-1.svg', width: 210, height: 63, linePx: 6 },
  { icon: '/icons/brush-2.svg', width: 219, height: 70, linePx: 11 },
  { icon: '/icons/brush-3.svg', width: 246, height: 82, linePx: 18 },
];

/** The marker's default spot on the colour wheel (`31:2237`, Ellipse 7). */
export const DEFAULT_WHEEL_POINT = { x: 0.49, y: 0.235 } as const;
export const DEFAULT_COLOR = '#FF4848';

export const isMode = (value: unknown): value is InteractiveMode =>
  value === 'comet' || value === 'milky-way' || value === 'palette';

export const defaultSetup = (mode: InteractiveMode): Setup => {
  switch (SETUP_KIND[mode]) {
    case 'color':
      return { kind: 'color', color: DEFAULT_COLOR };
    case 'width':
      return { kind: 'width', width: 0 };
    default:
      return { kind: 'palette', palette: 0 };
  }
};

/** `params` of `session:request` (shared-modules.md § 5). */
export const toParams = (setup: Setup): SessionRequest['params'] => {
  switch (setup.kind) {
    case 'color':
      return { color: setup.color };
    case 'width':
      return { width: setup.width };
    default:
      return { palette: setup.palette };
  }
};

export const toRequest = (
  mode: InteractiveMode,
  setup: Setup,
): SessionRequest => ({ mode, params: toParams(setup) });
