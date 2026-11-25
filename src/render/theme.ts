// Mission-control vector look: thin lines and monospace type on black.

export const COLOR = {
  bg: '#000000',
  grid: 'rgba(90, 150, 180, 0.07)',
  gridMajor: 'rgba(90, 150, 180, 0.15)',
  frame: 'rgba(150, 195, 215, 0.35)',
  body: '#e6eff3',
  bodyDim: 'rgba(230, 239, 243, 0.3)',
  rock: 'rgba(200, 215, 222, 0.55)',
  orbit: 'rgba(170, 195, 208, 0.2)',
  label: 'rgba(205, 222, 230, 0.78)',
  labelDim: 'rgba(205, 222, 230, 0.42)',
  cyan: '#46d7ff',
  cyanDim: 'rgba(70, 215, 255, 0.5)',
  cyanFaint: 'rgba(70, 215, 255, 0.18)',
  green: '#6dffa6',
  greenDim: 'rgba(109, 255, 166, 0.45)',
  amber: '#ffb547',
  amberDim: 'rgba(255, 181, 71, 0.45)',
  red: '#ff5a52',
  text: '#d9e7ee',
  textDim: 'rgba(217, 231, 238, 0.5)',
  panel: 'rgba(0, 0, 0, 0.9)',
} as const;

export const FONT_STACK = '"IBM Plex Mono", "JetBrains Mono", Consolas, "SF Mono", Menlo, "DejaVu Sans Mono", monospace';

export function font(size: number, weight = 400): string {
  return `${weight} ${size}px ${FONT_STACK}`;
}
