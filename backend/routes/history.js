import { Router } from "express";
import PriceSnapshot from "../models/PriceSnapshot.js";
import Book from "../models/Book.js";

const router = Router();

/**
 * GET /api/history/:bookId?days=30&source=google_books
 * Get price history for a specific book
 */
router.get("/:bookId", async (req, res) => {
  try {
    const { bookId } = req.params;
    const { days = 30, source } = req.query;

    const book = await Book.findById(bookId).lean();
    if (!book) return res.status(404).json({ error: "Book not found" });

    const history = await PriceSnapshot.getHistory(bookId, {
      days: parseInt(days),
      source: source || null,
    });

    // Group by source for chart-friendly output
    const bySource = {};
    for (const snap of history) {
      if (!bySource[snap.source]) bySource[snap.source] = [];
      bySource[snap.source].push({
        date: snap.capturedAt,
        listPrice: snap.listPrice,
        retailPrice: snap.retailPrice,
        format: snap.format,
        available: snap.available,
      });
    }

    res.json({
      bookId,
      title: book.title,
      days: parseInt(days),
      totalSnapshots: history.length,
      sources: Object.keys(bySource),
      history: bySource,
    });
  } catch (err) {
    console.error("[History] Fetch error:", err.message);
    res.status(500).json({ error: "Failed to fetch history" });
  }
});

/**
 * GET /api/history/:bookId/trend
 * Get price trend analysis for a book
 */
router.get("/:bookId/trend", async (req, res) => {
  try {
    const { bookId } = req.params;

    const book = await Book.findById(bookId).lean();
    if (!book) return res.status(404).json({ error: "Book not found" });

    // Get trends from all sources
    const sources = ["google_books", "open_library"];
    const trends = {};

    for (const source of sources) {
      trends[source] = await PriceSnapshot.getTrend(bookId, source);
    }

    res.json({
      bookId,
      title: book.title,
      currentCheapest: book.cheapestPrice,
      currentSource: book.cheapestSource,
      trends,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to calculate trends" });
  }
});

/**
 * GET /api/history/:bookId/compare
 * Compare price across sources over time
 */
router.get("/:bookId/compare", async (req, res) => {
  try {
    const { bookId } = req.params;
    const { days = 30 } = req.query;

    const book = await Book.findById(bookId).lean();
    if (!book) return res.status(404).json({ error: "Book not found" });

    const history = await PriceSnapshot.getHistory(bookId, {
      days: parseInt(days),
    });

    // Build timeline with all sources aligned by date
    const dateMap = new Map();

    for (const snap of history) {
      const dateKey = snap.capturedAt.toISOString().split("T")[0];
      if (!dateMap.has(dateKey)) {
        dateMap.set(dateKey, { date: dateKey });
      }
      const entry = dateMap.get(dateKey);
      entry[snap.source] = snap.retailPrice;
      entry[`${snap.source}_available`] = snap.available;
    }

    const timeline = Array.from(dateMap.values()).sort(
      (a, b) => new Date(a.date) - new Date(b.date)
    );

    res.json({
      bookId,
      title: book.title,
      days: parseInt(days),
      timeline,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to build comparison" });
  }
});

/**
 * GET /api/history/alerts/drops
 * Get recent price drops across all tracked books
 */
router.get("/alerts/drops", async (req, res) => {
  try {
    const { threshold = 5 } = req.query; // minimum % drop

    const trackedBooks = await Book.find({ trackingEnabled: true }).lean();
    const drops = [];

    for (const book of trackedBooks) {
      for (const source of ["google_books", "open_library"]) {
        const trend = await PriceSnapshot.getTrend(book._id, source);
        if (trend.trend === "falling" && Math.abs(trend.change) >= parseFloat(threshold)) {
          drops.push({
            bookId: book._id,
            title: book.title,
            source,
            changePercent: trend.change,
            currentPrice: book.cheapestPrice,
            thumbnail: book.thumbnail,
          });
        }
      }
    }

    drops.sort((a, b) => a.changePercent - b.changePercent); // biggest drops first

    res.json({
      threshold: parseFloat(threshold),
      count: drops.length,
      drops,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to scan for drops" });
  }
});

export default router;