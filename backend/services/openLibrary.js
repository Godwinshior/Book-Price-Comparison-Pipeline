/**
 * Open Library API Service
 * Docs: https://openlibrary.org/developers/api
 *
 * Open Library is free/open — no API key needed.
 * Books are largely free to borrow, so "price" here means
 * availability + edition metadata. We also check for
 * purchasable editions via the editions API.
 */

const OL_BASE = "https://openlibrary.org";
const OL_SEARCH = `${OL_BASE}/search.json`;

async function fetchJSON(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "BookPricePipeline/2.0" },
  });
  if (!res.ok) throw new Error(`OL API ${res.status}: ${url}`);
  return res.json();
}

/**
 * Search Open Library by query string
 */
export async function searchBooks(query, limit = 10) {
  const params = new URLSearchParams({
    q: query,
    limit: String(limit),
    fields:
      "key,title,author_name,first_publish_year,isbn,cover_i,publisher,number_of_pages_median,subject,edition_count",
  });

  const data = await fetchJSON(`${OL_SEARCH}?${params}`);

  return (data.docs || []).map((doc) => ({
    source: "open_library",
    openLibraryKey: doc.key?.replace("/works/", ""),
    title: doc.title,
    authors: doc.author_name || [],
    publishedDate: doc.first_publish_year
      ? String(doc.first_publish_year)
      : null,
    isbn: doc.isbn?.[0] || null,
    thumbnail: doc.cover_i
      ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
      : null,
    publisher: doc.publisher?.[0] || null,
    pageCount: doc.number_of_pages_median || null,
    categories: (doc.subject || []).slice(0, 5),
    editionCount: doc.edition_count || 0,
  }));
}

/**
 * Get edition details + pricing info for a work
 */
export async function getEditions(workKey) {
  const data = await fetchJSON(
    `${OL_BASE}/works/${workKey}/editions.json?limit=20`
  );

  return (data.entries || []).map((ed) => ({
    key: ed.key,
    title: ed.title,
    isbn:
      ed.isbn_13?.[0] || ed.isbn_10?.[0] || null,
    format: inferFormat(ed.physical_format),
    publishers: ed.publishers || [],
    publishDate: ed.publish_date || null,
    pages: ed.number_of_pages || null,
    // OL doesn't have direct pricing but we can flag availability
    available: true,
    // Some editions link to purchase
    buyLink: ed.key
      ? `https://openlibrary.org${ed.key}`
      : null,
  }));
}

/**
 * Lookup by ISBN
 */
export async function lookupISBN(isbn) {
  const data = await fetchJSON(
    `${OL_BASE}/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`
  );
  const entry = data[`ISBN:${isbn}`];
  if (!entry) return null;

  return {
    source: "open_library",
    title: entry.title,
    authors: (entry.authors || []).map((a) => a.name),
    publisher: entry.publishers?.[0]?.name || null,
    publishedDate: entry.publish_date || null,
    thumbnail: entry.cover?.medium || null,
    pageCount: entry.number_of_pages || null,
    isbn,
    // Check for ebook availability
    ebook: entry.ebooks?.[0] || null,
    available: (entry.ebooks || []).length > 0,
    buyLink: entry.url || null,
    // OL books are free to borrow — price is 0
    retailPrice: entry.ebooks?.length > 0 ? 0 : null,
    listPrice: null,
    currency: "USD",
    format: entry.ebooks?.length > 0 ? "ebook" : "unknown",
  };
}

function inferFormat(physical) {
  if (!physical) return "unknown";
  const p = physical.toLowerCase();
  if (p.includes("hardcover") || p.includes("hard")) return "hardcover";
  if (p.includes("paper") || p.includes("soft")) return "paperback";
  if (p.includes("ebook") || p.includes("digital")) return "ebook";
  return "unknown";
}

export default { searchBooks, getEditions, lookupISBN };