import { Router } from "express";
import Book from "../models/Book.js";
import { searchAll, lookupISBN, refreshPrices } from "../services/aggregator.js";
import { normalizeBatch, calculateSavings } from "../services/priceNormalizer.js";
import { searchLimiter, refreshLimiter } from "../middleware/rateLimiter.js";

const router = Router();

/**
 * GET /api/books/search?q=...&limit=10
 * Search across all sources, return merged results
 */
router.get("/search", searchLimiter, async (req, res) => {
  try {
    const { q, limit = 10 } = req.query;
    if (!q || q.trim().length < 2) {
      return res.status(400).json({ error: "Query must be at least 2 characters" });
    }

    const results = await searchAll(q.trim(), Math.min(parseInt(limit), 40));

    res.json({
      query: q.trim(),
      count: results.length,
      results,
    });
  } catch (err) {
    console.error("[Route] Search error:", err.message);
    res.status(500).json({ error: "Search failed", detail: err.message });
  }
});

/**
 * GET /api/books/isbn/:isbn
 * Lookup by ISBN across all sources
 */
router.get("/isbn/:isbn", searchLimiter, async (req, res) => {
  try {
    const { isbn } = req.params;
    const cleaned = isbn.replace(/[-\s]/g, "");

    if (!/^\d{10}(\d{3})?$/.test(cleaned)) {
      return res.status(400).json({ error: "Invalid ISBN format" });
    }

    const result = await lookupISBN(cleaned);

    if (!result) {
      return res.status(404).json({ error: "Book not found for this ISBN" });
    }

    res.json(result);
  } catch (err) {
    console.error("[Route] ISBN lookup error:", err.message);
    res.status(500).json({ error: "ISBN lookup failed", detail: err.message });
  }
});

/**
 * POST /api/books/track
 * Enable price tracking for a book (upserts into DB)
 */
router.post("/track", async (req, res) => {
  try {
    const {
      title, authors, isbn, googleBooksId, openLibraryKey,
      thumbnail, publisher, publishedDate, pageCount, categories,
      description, prices,
    } = req.body;

    if (!title) {
      return res.status(400).json({ error: "Title is required" });
    }

    // Upsert: find by ISBN or googleBooksId or title+author
    let book = null;
    if (isbn) book = await Book.findOne({ isbn });
    if (!book && googleBooksId) book = await Book.findOne({ googleBooksId });
    if (!book) {
      book = await Book.findOne({
        title: { $regex: new RegExp(`^${escapeRegex(title)}$`, "i") },
        "authors.0": authors?.[0],
      });
    }

    if (book) {
      // Update existing
      book.trackingEnabled = true;
      if (prices) book.prices = prices;
      if (googleBooksId) book.googleBooksId = googleBooksId;
      if (openLibraryKey) book.openLibraryKey = openLibraryKey;
      if (thumbnail) book.thumbnail = thumbnail;
      book.recalcCheapest();
      await book.save();
    } else {
      // Create new
      book = new Book({
        title, authors: authors || [], isbn,
        googleBooksId, openLibraryKey,
        thumbnail, publisher, publishedDate,
        pageCount, categories, description,
        prices: prices || [],
        trackingEnabled: true,
        lastPriceCheck: new Date(),
      });
      book.recalcCheapest();
      await book.save();
    }

    res.json({ message: "Tracking enabled", book });
  } catch (err) {
    console.error("[Route] Track error:", err.message);
    res.status(500).json({ error: "Failed to enable tracking", detail: err.message });
  }
});

/**
 * DELETE /api/books/track/:id
 * Disable tracking for a book
 */
router.delete("/track/:id", async (req, res) => {
  try {
    const book = await Book.findById(req.params.id);
    if (!book) return res.status(404).json({ error: "Book not found" });

    book.trackingEnabled = false;
    await book.save();

    res.json({ message: "Tracking disabled", bookId: book._id });
  } catch (err) {
    res.status(500).json({ error: "Failed to disable tracking" });
  }
});

/**
 * GET /api/books/tracked
 * List all tracked books with current prices
 */
router.get("/tracked", async (req, res) => {
  try {
    const { sort = "cheapestPrice", order = "asc", limit = 50 } = req.query;

    const sortObj = {};
    sortObj[sort] = order === "desc" ? -1 : 1;

    const books = await Book.find({ trackingEnabled: true })
      .sort(sortObj)
      .limit(Math.min(parseInt(limit), 200))
      .lean();

    res.json({
      count: books.length,
      books,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch tracked books" });
  }
});

/**
 * GET /api/books/:id
 * Get full detail for a single tracked book
 */
router.get("/:id", async (req, res) => {
  try {
    const book = await Book.findById(req.params.id).lean();
    if (!book) return res.status(404).json({ error: "Book not found" });

    const priceInfo = normalizeBatch(book.prices || []);
    const savings = calculateSavings(priceInfo.all);

    res.json({ book, priceInfo, savings });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch book details" });
  }
});

/**
 * POST /api/books/:id/refresh
 * Manually trigger a price refresh for one book
 */
router.post("/:id/refresh", refreshLimiter, async (req, res) => {
  try {
    const book = await Book.findById(req.params.id);
    if (!book) return res.status(404).json({ error: "Book not found" });

    const result = await refreshPrices(book);

    res.json({
      message: "Prices refreshed",
      book: result.book,
      savings: result.savings,
    });
  } catch (err) {
    res.status(500).json({ error: "Refresh failed", detail: err.message });
  }
});

/**
 * GET /api/books/stats/overview
 * Dashboard stats
 */
router.get("/stats/overview", async (req, res) => {
  try {
    const [totalTracked, withPrices, totalBooks] = await Promise.all([
      Book.countDocuments({ trackingEnabled: true }),
      Book.countDocuments({ trackingEnabled: true, cheapestPrice: { $ne: null } }),
      Book.countDocuments(),
    ]);

    const avgPrice = await Book.aggregate([
      { $match: { trackingEnabled: true, cheapestPrice: { $ne: null } } },
      { $group: { _id: null, avg: { $avg: "$cheapestPrice" }, min: { $min: "$cheapestPrice" }, max: { $max: "$cheapestPrice" } } },
    ]);

    res.json({
      totalBooks,
      totalTracked,
      withPrices,
      avgPrice: avgPrice[0]?.avg ? Math.round(avgPrice[0].avg * 100) / 100 : 0,
      minPrice: avgPrice[0]?.min || 0,
      maxPrice: avgPrice[0]?.max || 0,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default router;