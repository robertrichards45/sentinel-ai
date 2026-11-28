/**
 * Folding phones (iPhone Duo, Galaxy Z Fold): the screen changes size while Alice is open.
 *  - closed (cover screen): Alice shows her own compact "glance" screen
 *  - open (inner screen): a side rail, the screen you picked, and Talk always ready on the right
 * Every screen reads this hook, so the layout changes the moment the phone is folded or unfolded.
 */
import { Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isWide, splitWidths, isCoverShape, isFoldModel } from './layoutCore';
import { useSettings } from './hooks';
export { isWide, splitWidths, isCoverShape };

export const RAIL = 92; // width of the side rail on an unfolded screen

const androidModel = Platform.OS === 'android' ? String((Platform.constants as any)?.Model ?? '') : '';
export const knownFoldable = () => isFoldModel(androidModel);

export function useLayout() {
  const { width, height } = useWindowDimensions();
  const inset = useSafeAreaInsets();
  const s = useSettings();
  const wide = isWide(width, height);
  const foldable = !!s.foldable || knownFoldable() || isCoverShape(width, height);
  const cover = !wide && foldable;
  // Insets can differ left and right on a folding phone, so both are subtracted.
  const content = width - RAIL - inset.left - inset.right;
  // Talk gets its own column only when both columns stay comfortable; otherwise it's a rail item.
  const split = wide && content >= 760;
  return { width, height, wide, cover, foldable, inset, content, split, ...splitWidths(content) };
}
