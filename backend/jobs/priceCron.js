/**
 * Price Cron Job
 *
 * Periodically refreshes prices for all tracked books.
 * Uses staggered delays to avoid API rate limits.
 * Default schedule: every 6 hours.
 */

import cron from "node-cron";
import Book from "../models/Book.js";
import { refreshPrices } from "../services/aggregator.js";

const BATCH_SIZE = 10;
const DELAY_BETWEEN_BOOKS_MS = 2000; // 2s between each book
const DELAY_BETWEEN_BATCHES_MS = 10000; // 10s between batches

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run a single price refresh cycle
 */
async function runPriceRefresh() {
  const startTime = Date.now();
  console.log(`[Cron] Price refresh started at ${new Date().toISOString()}`);

  try {
    const trackedBooks = await Book.find({ trackingEnabled: true })
      .sort({ lastPriceCheck: 1 }) // oldest check first
      .lean();

    if (trackedBooks.length === 0) {
      console.log("[Cron] No tracked books found. Skipping.");
      return { processed: 0, errors: 0, duration: 0 };
    }

    console.log(`[Cron] Found ${trackedBooks.length} tracked books`);

    let processed = 0;
    let errors = 0;
    let priceChanges = 0;

    // Process in batches
    for (let i = 0; i < trackedBooks.length; i += BATCH_SIZE) {
      const batch = trackedBooks.slice(i, i + BATCH_SIZE);
      console.log(
        `[Cron] Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(trackedBooks.length / BATCH_SIZE)}`
      );

      for (const bookData of batch) {
        try {
          // Re-fetch the full mongoose document
          const bookDoc = await Book.findById(bookData._id);
          if (!bookDoc) continue;

          const oldCheapest = bookDoc.cheapestPrice;

          await refreshPrices(bookDoc);

          processed++;

          // Detect price change
          if (
            oldCheapest != null &&
            bookDoc.cheapestPrice != null &&
            oldCheapest !== bookDoc.cheapestPrice
          ) {
            priceChanges++;
            const direction =
              bookDoc.cheapestPrice < oldCheapest ? "▼ DROP" : "▲ RISE";
            console.log(
              `[Cron] ${direction}: "${bookDoc.title}" $${oldCheapest} → $${bookDoc.cheapestPrice}`
            );
          }
        } catch (err) {
          errors++;
          console.error(
            `[Cron] Error refreshing "${bookData.title}": ${err.message}`
          );
        }

        // Stagger requests
        await sleep(DELAY_BETWEEN_BOOKS_MS);
      }

      // Pause between batches
      if (i + BATCH_SIZE < trackedBooks.length) {
        console.log(
          `[Cron] Batch complete. Pausing ${DELAY_BETWEEN_BATCHES_MS / 1000}s...`
        );
        await sleep(DELAY_BETWEEN_BATCHES_MS);
      }
    }

    const duration = Math.round((Date.now() - startTime) / 1000);
    console.log(
      `[Cron] Refresh complete: ${processed} processed, ${errors} errors, ${priceChanges} price changes, ${duration}s elapsed`
    );

    return { processed, errors, priceChanges, duration };
  } catch (err) {
    console.error(`[Cron] Fatal error: ${err.message}`);
    return { processed: 0, errors: 1, duration: 0 };
  }
}

/**
 * Start the cron scheduler
 */
export function startCronJobs() {
  const schedule = process.env.PRICE_CRON_SCHEDULE || "0 */6 * * *";

  if (!cron.validate(schedule)) {
    console.error(`[Cron] Invalid schedule: "${schedule}". Using default.`);
    return startWithSchedule("0 */6 * * *");
  }

  return startWithSchedule(schedule);
}

function startWithSchedule(schedule) {
  console.log(`[Cron] Price tracker scheduled: "${schedule}"`);

  const task = cron.schedule(schedule, runPriceRefresh, {
    scheduled: true,
    timezone: "UTC",
  });

  return task;
}

/**
 * Manually trigger a refresh (for API endpoint)
 */
export { runPriceRefresh };

export default { startCronJobs, runPriceRefresh };