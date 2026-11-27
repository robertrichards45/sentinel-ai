/**
 * "Alice, order me dog food from Walmart." Stores don't let other apps place orders for you (no public
 * ordering API, and Alice never pays for anything by herself), so she does everything up to the payment:
 * remembers your usual store, brand and pickup-or-delivery, opens that store's app at the right search, and
 * tells you what to tap. Next time "order dog food" is enough.
 */
import { Linking } from 'react-native';
import { readJson, writeJson } from './storage';
import { ShopPrefs, planOrder, storeLink } from './shopCore';
import { note } from './diary';

export async function shop(item: string, store?: string, fulfillment?: 'delivery' | 'pickup', brand?: string): Promise<string> {
  const prefs = await readJson<ShopPrefs>('shopping.json', { items: {} });
  const plan = planOrder({ ...prefs, items: prefs.items ?? {} }, item, store, fulfillment, brand);
  if (!plan.store) return `Which store should I use for ${item}, like Walmart, Target or Amazon? I'll remember it.`;
  const link = storeLink(plan.store, plan.query);
  if (!link) return `I can't open ${plan.store} yet. I can do Walmart, Target, Amazon, Instacart, Kroger, Costco, Sam's Club, Chewy, PetSmart, Home Depot, Lowe's or Best Buy.`;
  await writeJson('shopping.json', plan.prefs);
  note('shop', { store: link.name, saved: plan.usedSaved });
  try { await Linking.openURL(link.url); } catch { return `I couldn't open ${link.name}.`; }
  const how = plan.fulfillment ? ` Choose ${plan.fulfillment === 'pickup' ? 'pickup at your store' : 'delivery'} at checkout, like last time.` : ' Pick delivery or pickup at checkout, and tell me which you like so I remember.';
  return `Opened ${link.name} with ${plan.query}.${plan.usedSaved ? ' That\'s your usual.' : ''} Add it to your cart and check out; you confirm the payment yourself.${how}`;
}
