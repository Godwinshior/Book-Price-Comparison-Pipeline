import rateLimit from "express-rate-limit";

// General API rate limit
export const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many requests. Please try again later.",
    retryAfter: "15 minutes",
  },
});

// Stricter limit for search (hits external APIs)
export const searchLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 15,
  message: {
    error: "Search rate limit reached. Please wait before searching again.",
  },
});

// Very strict limit for manual refresh triggers
export const refreshLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 5,
  message: {
    error: "Refresh rate limit reached. The cron job handles periodic updates.",
  },
});

export default { apiLimiter, searchLimiter, refreshLimiter };