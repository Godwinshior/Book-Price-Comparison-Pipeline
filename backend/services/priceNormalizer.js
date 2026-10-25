/**
 * Price Normalizer
 *
 * Normalizes prices across sources into a consistent format.
 * Handles currency conversion, format categorization,
 * and null/missing price inference.
 */

// Static exchange rates (in production, fetch from an API)
const EXCHANGE_RATES = {
  USD: 1.0,
  EUR: 1.08,
  GBP: 1.27,
  CAD: 0.74,
  AUD: 0.65,
  INR: 0.012,
  JPY: 0.0067,
  NGN: 0.00063,
};

/**
 * Convert any currency amount to USD
 */
export function toUSD(amount, fromCurrency = "USD") {
  if (amount == null) return null;
  const rate = EXCHANGE_RATES[fromCurrency.toUpperCase()];
  if (!rate) {
    console.warn(`[Normalizer] Unknown currency: ${fromCurrency}, using 1:1`);
    return amount;
  }
  return Math.round(amount * rate * 100) / 100;
}

/**
 * Normalize a single price entry from any source
 */
export function normalizePrice(rawPrice) {
  return {
    source: rawPrice.source,
    listPrice: toUSD(rawPrice.listPrice, rawPrice.currency),
    retailPrice: toUSD(rawPrice.retailPrice, rawPrice.currency),
    currency: "USD",
    buyLink: rawPrice.buyLink || null,
    format: normalizeFormat(rawPrice.format),
    available: Boolean(rawPrice.available),
    originalCurrency: rawPrice.currency || "USD",
    originalRetailPrice: rawPrice.retailPrice,
  };
}

/**
 * Normalize format strings from various sources
 */
function normalizeFormat(format) {
  if (!format) return "unknown";
  const f = format.toLowerCase().trim();

  if (f.includes("ebook") || f.includes("kindle") || f.includes("digital") || f.includes("epub"))
    return "ebook";
  if (f.includes("hardcover") || f.includes("hard") || f.includes("hc"))
    return "hardcover";
  if (f.includes("paper") || f.includes("soft") || f.includes("pb") || f.includes("mass market"))
    return "paperback";
  if (f.includes("audio")) return "audiobook";
  return "unknown";
}

/**
 * Normalize an array of prices from mixed sources,
 * group by format, and find cheapest per format
 */
export function normalizeBatch(prices) {
  const normalized = prices.map(normalizePrice);

  // Group by format
  const byFormat = {};
  for (const p of normalized) {
    if (!byFormat[p.format]) byFormat[p.format] = [];
    byFormat[p.format].push(p);
  }

  // Find cheapest per format
  const cheapestByFormat = {};
  for (const [format, entries] of Object.entries(byFormat)) {
    const available = entries.filter(
      (e) => e.available && e.retailPrice != null
    );
    if (available.length > 0) {
      available.sort((a, b) => a.retailPrice - b.retailPrice);
      cheapestByFormat[format] = available[0];
    }
  }

  // Find overall cheapest
  const allAvailable = normalized.filter(
    (e) => e.available && e.retailPrice != null
  );
  allAvailable.sort((a, b) => a.retailPrice - b.retailPrice);

  return {
    all: normalized,
    byFormat,
    cheapestByFormat,
    cheapestOverall: allAvailable[0] || null,
    sourceCount: new Set(normalized.map((p) => p.source)).size,
  };
}

/**
 * Calculate savings between sources
 */
export function calculateSavings(prices) {
  const available = prices
    .filter((p) => p.available && p.retailPrice != null)
    .sort((a, b) => a.retailPrice - b.retailPrice);

  if (available.length < 2)
    return { hasSavings: false, amount: 0, percent: 0 };

  const cheapest = available[0].retailPrice;
  const mostExpensive = available[available.length - 1].retailPrice;
  const amount = Math.round((mostExpensive - cheapest) * 100) / 100;
  const percent =
    mostExpensive > 0
      ? Math.round((amount / mostExpensive) * 10000) / 100
      : 0;

  return {
    hasSavings: amount > 0,
    amount,
    percent,
    cheapestSource: available[0].source,
    mostExpensiveSource: available[available.length - 1].source,
  };
}

export default { toUSD, normalizePrice, normalizeBatch, calculateSavings };