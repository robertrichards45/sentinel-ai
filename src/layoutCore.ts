/** Folding-screen layout math (pure, unit-tested). See layout.ts. */
/** Pure, unit-tested: is a window this size an unfolded (tablet-like) screen? */
export function isWide(width: number, height: number): boolean {
  // Regular phones are under ~440 pt wide in portrait. Unfolded inner screens are ~600-900 pt and close to square.
  return width >= 600 && width / Math.max(height, 1) >= 0.62;
}

/** Width of the left (current screen) pane when the Talk pane sits beside it. */
export function splitWidths(width: number): { left: number; right: number } {
  const right = Math.round(Math.min(Math.max(width * 0.44, 340), 520));
  return { left: width - right, right };
}
