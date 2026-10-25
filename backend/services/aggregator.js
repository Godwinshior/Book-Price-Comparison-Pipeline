/**
 * Aggregator Service
 *
 * Fetches from all sources via Promise.allSettled(),
 * deduplicates by ISBN/title+author, merges metadata,
 * and returns unified results with normalized pricing.
 */

import * as googleBooks from "./googleBooks.js";
import * as openLibrary from "./openLibrary.js";
import { normalizeBatch, calculateSavings } from "./priceNormalizer.js";
import Book from "../models/Book.js";
import PriceSnapshot from "../models/PriceSnapshot.js";

/**
 * Search all sources and return merged, deduplicated results
 */
export async function searchAll(query, limit = 10) {
  const results = await Promise.allSettled([
    googleBooks.searchBooks(query, limit),
    openLibrary.searchBooks(query, limit),
  ]);

  const allBooks = [];

  results.forEach((result, idx) => {
    const sourceName = ["google_books", "open_library"][idx];
    if (result.status === "fulfilled") {
      allBooks.push(...result.value);
    } else {
      console.warn(`[Aggregator] ${sourceName} failed: ${result.reason.message}`);
    }
  });

  // Deduplicate and merge
  return deduplicateAndMerge(allBooks);
}

/**
 * Look up a specific book by ISBN across all sources
 */
export async function lookupISBN(isbn) {
  const results = await Promise.allSettled([
    googleBooks.lookupISBN(isbn),
    openLibrary.lookupISBN(isbn),
  ]);

  const found = results
    .filter((r) => r.status === "fulfilled" && r.value != null)
    .map((r) => r.value);

  if (found.length === 0) return null;

  // Merge all found entries into one book
  const merged = mergeBookEntries(found);
  return merged;
}

/**
 * Fetch latest prices for a tracked book and save snapshots
 */
export async function refreshPrices(bookDoc) {
  const prices = [];

  // Try ISBN lookup first (most precise)
  if (bookDoc.isbn) {
    const results = await Promise.allSettled([
      googleBooks.lookupISBN(bookDoc.isbn),
      openLibrary.lookupISBN(bookDoc.isbn),
    ]);

    results.forEach((r) => {
      if (r.status === "fulfilled" && r.value) {
        prices.push({
          source: r.value.source,
          listPrice: r.value.listPrice,
          retailPrice: r.value.retailPrice,
          currency: r.value.currency || "USD",
          buyLink: r.value.buyLink,
          format: r.value.format || "unknown",
          available: Boolean(r.value.available),
        });
      }
    });
  }

  // Fallback to title search for Google Books if no ISBN
  if (prices.length === 0 && bookDoc.title) {
    try {
      const gbResults = await googleBooks.searchBooks(
        `${bookDoc.title} ${bookDoc.authors?.[0] || ""}`,
        1
      );
      if (gbResults[0]) {
        prices.push({
          source: "google_books",
          listPrice: gbResults[0].listPrice,
          retailPrice: gbResults[0].retailPrice,
          currency: gbResults[0].currency || "USD",
          buyLink: gbResults[0].buyLink,
          format: gbResults[0].format || "unknown",
          available: Boolean(gbResults[0].available),
        });
      }
    } catch (err) {
      console.warn(`[Aggregator] GB title fallback failed: ${err.message}`);
    }
  }

  // Normalize and update
  const normalized = normalizeBatch(prices);

  // Save snapshots for history
  const snapshots = normalized.all.map((p) => ({
    bookId: bookDoc._id,
    isbn: bookDoc.isbn,
    source: p.source,
    listPrice: p.listPrice,
    retailPrice: p.retailPrice,
    currency: p.currency,
    format: p.format,
    available: p.available,
    capturedAt: new Date(),
  }));

  if (snapshots.length > 0) {
    await PriceSnapshot.insertMany(snapshots);
  }

  // Update book document
  bookDoc.prices = normalized.all;
  bookDoc.lastPriceCheck = new Date();
  bookDoc.recalcCheapest();
  await bookDoc.save();

  return { book: bookDoc, normalized, savings: calculateSavings(normalized.all) };
}

/**
 * Deduplicate books from multiple sources
 * Uses ISBN as primary key, falls back to title+author similarity
 */
function deduplicateAndMerge(books) {
  const isbnMap = new Map();
  const titleMap = new Map();
  const merged = [];

  for (const book of books) {
    const isbn = book.isbn;
    const titleKey = normalizeTitle(book.title, book.authors?.[0]);

    if (isbn && isbnMap.has(isbn)) {
      // Merge into existing
      const existing = isbnMap.get(isbn);
      mergeInto(existing, book);
    } else if (titleMap.has(titleKey)) {
      const existing = titleMap.get(titleKey);
      mergeInto(existing, book);
    } else {
      // New entry
      const entry = {
        ...book,
        sources: [book.source],
        prices: book.retailPrice != null || book.available
          ? [{
              source: book.source,
              listPrice: book.listPrice ?? null,
              retailPrice: book.retailPrice ?? null,
              currency: book.currency || "USD",
              buyLink: book.buyLink || null,
              format: book.format || "unknown",
              available: Boolean(book.available),
            }]
          : [],
      };
      if (isbn) isbnMap.set(isbn, entry);
      titleMap.set(titleKey, entry);
      merged.push(entry);
    }
  }

  // Calculate cheapest for each merged book
  return merged.map((book) => {
    const priceInfo = normalizeBatch(book.prices || []);
    return {
      ...book,
      cheapestPrice: priceInfo.cheapestOverall?.retailPrice ?? null,
      cheapestSource: priceInfo.cheapestOverall?.source ?? null,
      savings: calculateSavings(priceInfo.all),
      priceInfo,
    };
  });
}

function normalizeTitle(title, author) {
  const t = (title || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const a = (author || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return `${t}::${a}`;
}

function mergeInto(existing, incoming) {
  // Add source
  if (!existing.sources) existing.sources = [existing.source];
  if (!existing.sources.includes(incoming.source)) {
    existing.sources.push(incoming.source);
  }

  // Merge IDs
  if (incoming.googleBooksId) existing.googleBooksId = incoming.googleBooksId;
  if (incoming.openLibraryKey) existing.openLibraryKey = incoming.openLibraryKey;

  // Prefer non-null metadata
  if (!existing.description && incoming.description)
    existing.description = incoming.description;
  if (!existing.thumbnail && incoming.thumbnail)
    existing.thumbnail = incoming.thumbnail;
  if (!existing.pageCount && incoming.pageCount)
    existing.pageCount = incoming.pageCount;
  if (!existing.isbn && incoming.isbn) existing.isbn = incoming.isbn;

  // Merge prices
  if (!existing.prices) existing.prices = [];
  if (incoming.retailPrice != null || incoming.available) {
    existing.prices.push({
      source: incoming.source,
      listPrice: incoming.listPrice ?? null,
      retailPrice: incoming.retailPrice ?? null,
      currency: incoming.currency || "USD",
      buyLink: incoming.buyLink || null,
      format: incoming.format || "unknown",
      available: Boolean(incoming.available),
    });
  }
}

export default { searchAll, lookupISBN, refreshPrices };