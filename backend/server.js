import "dotenv/config";
import express from "express";
import cors from "cors";
import connectDB from "./config/db.js";
import { apiLimiter } from "./middleware/rateLimiter.js";
import { startCronJobs, runPriceRefresh } from "./jobs/priceCron.js";
import booksRouter from "./routes/books.js";
import historyRouter from "./routes/history.js";

const app = express();
const PORT = process.env.PORT || 4000;

// ── Middleware ──────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use("/api", apiLimiter);

// ── Routes ─────────────────────────────────────────────
app.use("/api/books", booksRouter);
app.use("/api/history", historyRouter);

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// Manual cron trigger (admin use)
app.post("/api/admin/refresh-all", async (req, res) => {
  try {
    const result = await runPriceRefresh();
    res.json({ message: "Manual refresh complete", ...result });
  } catch (err) {
    res.status(500).json({ error: "Manual refresh failed" });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});

// Error handler
app.use((err, req, res, _next) => {
  console.error("[Server] Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// ── Start ──────────────────────────────────────────────
async function start() {
  await connectDB();
  startCronJobs();
  app.listen(PORT, () => {
    console.log(`\n  ┌─────────────────────────────────────────┐`);
    console.log(`  │  Book Price Pipeline API                │`);
    console.log(`  │  http://localhost:${PORT}                  │`);
    console.log(`  │  Endpoints:                             │`);
    console.log(`  │   GET  /api/books/search?q=...          │`);
    console.log(`  │   GET  /api/books/isbn/:isbn            │`);
    console.log(`  │   GET  /api/books/tracked               │`);
    console.log(`  │   POST /api/books/track                 │`);
    console.log(`  │   GET  /api/books/:id                   │`);
    console.log(`  │   POST /api/books/:id/refresh           │`);
    console.log(`  │   GET  /api/history/:bookId             │`);
    console.log(`  │   GET  /api/history/:bookId/trend       │`);
    console.log(`  │   GET  /api/history/:bookId/compare     │`);
    console.log(`  │   GET  /api/history/alerts/drops        │`);
    console.log(`  │   GET  /api/books/stats/overview        │`);
    console.log(`  └─────────────────────────────────────────┘\n`);
  });
}

start().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});