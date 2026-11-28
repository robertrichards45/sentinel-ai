/** Folding-screen layout math (pure, unit-tested). See layout.ts. */
/** Pure, unit-tested: is a window this size an unfolded (tablet-like) screen? */
export function isWide(width: number, height: number): boolean {
  // Regular phones are under ~440 pt wide in portrait. Unfolded inner screens are ~600-900 pt and close to square.
  return width >= 600 && width / Math.max(height, 1) >= 0.62;
}

/** Width of the left (current screen) pane when the Talk pane sits beside it. */
export function splitWidths(width: number): { left: number; right: number } {
  const right = Math.round(Math.min(Math.max(width * 0.46, 340), 520));
  return { left: width - right, right };
}

/**
 * Is this the cover (outer) screen of a folding phone? The iPhone Duo cover screen is unusually wide for its
 * height (about 466 x 678 pt), unlike any regular iPhone (about 0.46). The Z Fold cover screen is phone-shaped,
 * so Android also checks the model (see layout.ts).
 */
export function isCoverShape(width: number, height: number): boolean {
  const r = width / Math.max(height, 1);
  return width < 600 && r >= 0.6 && r <= 0.9;
}

/** Galaxy Z Fold model numbers start with SM-F9 (SM-F7 is the Flip, which has no big inner screen). */
export const isFoldModel = (model?: string) => !!model && (/^SM-F9\d/i.test(model) || /\bfold\b/i.test(model));
