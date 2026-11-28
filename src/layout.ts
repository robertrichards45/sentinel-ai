/**
 * Folding phones (iPhone Duo, Galaxy Z Fold): the screen changes size while Alice is open. Closed, the cover
 * screen is phone-shaped; open, the inner screen is nearly square and about twice as wide. Every screen reads
 * this hook, so the layout reflows the moment the phone is folded or unfolded.
 */
import { useWindowDimensions } from 'react-native';
import { isWide, splitWidths } from './layoutCore';
export { isWide, splitWidths };

export function useLayout() {
  const { width, height } = useWindowDimensions();
  const wide = isWide(width, height);
  return { width, height, wide, ...splitWidths(width) };
}
