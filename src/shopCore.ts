/** "Order me dog food from Walmart": store search links + remembered shopping preferences (pure, unit-tested). */
export type ShopPrefs = { store?: string; fulfillment?: 'delivery' | 'pickup'; items: Record<string, string> };

const STORES: [RegExp, string, (q: string) => string][] = [
  [/walmart/, 'Walmart', (q) => `https://www.walmart.com/search?q=${q}`],
  [/target/, 'Target', (q) => `https://www.target.com/s?searchTerm=${q}`],
  [/amazon/, 'Amazon', (q) => `https://www.amazon.com/s?k=${q}`],
  [/instacart/, 'Instacart', (q) => `https://www.instacart.com/store/s?k=${q}`],
  [/kroger/, 'Kroger', (q) => `https://www.kroger.com/search?query=${q}`],
  [/costco/, 'Costco', (q) => `https://www.costco.com/CatalogSearch?keyword=${q}`],
  [/sam'?s/, "Sam's Club", (q) => `https://www.samsclub.com/s/${q}`],
  [/chewy/, 'Chewy', (q) => `https://www.chewy.com/s?query=${q}`],
  [/petsmart/, 'PetSmart', (q) => `https://www.petsmart.com/search/?q=${q}`],
  [/door ?dash/, 'DoorDash', (q) => `https://www.doordash.com/search/store/${q}/`],
  [/home depot/, 'Home Depot', (q) => `https://www.homedepot.com/s/${q}`],
  [/lowe'?s/, "Lowe's", (q) => `https://www.lowes.com/search?searchTerm=${q}`],
  [/best buy/, 'Best Buy', (q) => `https://www.bestbuy.com/site/searchpage.jsp?st=${q}`],
];

export function storeLink(store: string, query: string): { name: string; url: string } | null {
  const s = store.toLowerCase();
  const hit = STORES.find(([re]) => re.test(s));
  return hit ? { name: hit[1], url: hit[2](encodeURIComponent(query.trim())) } : null;
}

const key = (item: string) => item.toLowerCase().replace(/\b(some|more|a|an|the|my|our|usual)\b/g, ' ').replace(/\s+/g, ' ').trim();

/** Decide what to search and update preferences ("Blue Buffalo dog food" teaches what "dog food" means). */
export function planOrder(prefs: ShopPrefs, item: string, store?: string, fulfillment?: 'delivery' | 'pickup', brand?: string) {
  const k = key(item);
  const items = { ...prefs.items };
  if (brand) items[k] = `${brand} ${item}`.replace(/\s+/g, ' ').trim();
  const query = items[k] || item;
  const next: ShopPrefs = { store: store || prefs.store, fulfillment: fulfillment || prefs.fulfillment, items };
  return { query, store: next.store, fulfillment: next.fulfillment, prefs: next, usedSaved: !brand && !!prefs.items[k] };
}
