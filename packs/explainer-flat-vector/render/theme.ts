/** Flat palettes for the explainer template. One per scene, cycled by position so a re-render looks the same. */
export type Palette = {
  bg: string;
  ink: string;
  accent: string;
  accent2: string;
  muted: string;
  card: string;
};

export const PALETTES: readonly Palette[] = [
  { bg: "#F4EFE6", ink: "#1F2A44", accent: "#E4572E", accent2: "#2E86AB", muted: "#CFC7B8", card: "#FFFFFF" },
  { bg: "#1F2A44", ink: "#F4EFE6", accent: "#F6AE2D", accent2: "#5BC0BE", muted: "#3A4A6B", card: "#2B3A5C" },
  { bg: "#E8F1F2", ink: "#13293D", accent: "#247BA0", accent2: "#F25F5C", muted: "#B8CDD3", card: "#FFFFFF" },
  { bg: "#FFF8E7", ink: "#2D2A32", accent: "#3BB273", accent2: "#E15554", muted: "#E0D6BE", card: "#FFFFFF" },
  { bg: "#2D2A32", ink: "#FFF8E7", accent: "#E15554", accent2: "#F6AE2D", muted: "#4A4552", card: "#3A3640" },
];

export function paletteFor(index: number): Palette {
  return PALETTES[((index % PALETTES.length) + PALETTES.length) % PALETTES.length];
}

/** Font stack: the font asset when the job sends one, then fonts a bare Linux box is likely to have. */
export const FONT_FAMILY = "VenStudioFont, 'Inter', 'DejaVu Sans', 'Liberation Sans', 'Noto Sans', Arial, Helvetica, sans-serif";
