/**
 * Google Books API Service
 * Docs: https://developers.google.com/books/docs/v1/using
 *
 * Free tier: 1000 req/day without key, more with key.
 * This is the primary pricing source — Google returns
 * listPrice and retailPrice for purchasable books.
 */

const GB_BASE = "https://www.googleapis.com/books/v1/volumes";

function buildURL(path, params = {}) {
  const key = process.env.GOOGLE_BOOKS_API_KEY;
  if (key) params.key = key;
  const qs = new URLSearchParams(params).toString();
  return `${GB_BASE}${path}${qs ? "?" + qs : ""}`;
}

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Books API ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

/**
 * Search Google Books
 */
export async function searchBooks(query, limit = 10) {
  const url = buildURL("", {
    q: query,
    maxResults: String(Math.min(limit, 40)),
    printType: "books",
    orderBy: "relevance",
  });

  const data = await fetchJSON(url);
  if (!data.items) return [];

  return data.items.map(parseVolume);
}

/**
 * Get volume details by Google Books ID
 */
export async function getVolume(volumeId) {
  const url = buildURL(`/${volumeId}`);
  const data = await fetchJSON(url);
  return parseVolume(data);
}

/**
 * Search by ISBN specifically
 */
export async function lookupISBN(isbn) {
  const url = buildURL("", {
    q: `isbn:${isbn}`,
    maxResults: "1",
  });

  const data = await fetchJSON(url);
  if (!data.items?.[0]) return null;
  return parseVolume(data.items[0]);
}

/**
 * Parse a Google Books volume into our normalized shape
 */
function parseVolume(item) {
  const info = item.volumeInfo || {};
  const sale = item.saleInfo || {};
  const access = item.accessInfo || {};

  // Extract pricing
  let listPrice = null;
  let retailPrice = null;
  let currency = "USD";
  let buyLink = null;
  let available = false;

  if (sale.saleability === "FOR_SALE" || sale.saleability === "FOR_SALE_AND_RENTAL") {
    available = true;
    if (sale.listPrice) {
      listPrice = sale.listPrice.amount;
      currency = sale.listPrice.currencyCode || "USD";
    }
    if (sale.retailPrice) {
      retailPrice = sale.retailPrice.amount;
      currency = sale.retailPrice.currencyCode || currency;
    }
    buyLink = sale.buyLink || null;
  } else if (sale.saleability === "FREE") {
    available = true;
    listPrice = 0;
    retailPrice = 0;
  }

  // Determine format
  let format = "unknown";
  if (access.epub?.isAvailable || sale.isEbook) format = "ebook";
  else if (info.printType === "BOOK") format = "paperback";

  // Extract ISBN
  const identifiers = info.industryIdentifiers || [];
  const isbn13 = identifiers.find((i) => i.type === "ISBN_13");
  const isbn10 = identifiers.find((i) => i.type === "ISBN_10");

  return {
    source: "google_books",
    googleBooksId: item.id,
    title: info.title || "Unknown",
    authors: info.authors || [],
    publisher: info.publisher || null,
    publishedDate: info.publishedDate || null,
    description: info.description || null,
    pageCount: info.pageCount || null,
    categories: info.categories || [],
    thumbnail: info.imageLinks?.thumbnail?.replace("http:", "https:") || null,
    language: info.language || "en",
    isbn: isbn13?.identifier || isbn10?.identifier || null,

    // Pricing
    listPrice,
    retailPrice,
    currency,
    buyLink,
    available,
    format,
    saleability: sale.saleability,
  };
}

export default { searchBooks, getVolume, lookupISBN };