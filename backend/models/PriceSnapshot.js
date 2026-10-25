import mongoose from "mongoose";

const PriceSnapshotSchema = new mongoose.Schema(
  {
    bookId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Book",
      required: true,
      index: true,
    },
    isbn: String,
    source: {
      type: String,
      enum: ["google_books", "open_library", "internet_archive"],
      required: true,
    },
    listPrice: Number,
    retailPrice: Number,
    currency: { type: String, default: "USD" },
    format: String,
    available: Boolean,
    capturedAt: { type: Date, default: Date.now, index: true },
  },
  {
    timestamps: false,
  }
);

// Compound index for efficient history queries
PriceSnapshotSchema.index({ bookId: 1, source: 1, capturedAt: -1 });

// TTL index: auto-delete snapshots older than 365 days
PriceSnapshotSchema.index({ capturedAt: 1 }, { expireAfterSeconds: 31536000 });

// Static: get price history for a book
PriceSnapshotSchema.statics.getHistory = async function (
  bookId,
  { days = 30, source = null } = {}
) {
  const since = new Date(Date.now() - days * 86400000);
  const filter = { bookId, capturedAt: { $gte: since } };
  if (source) filter.source = source;

  return this.find(filter).sort({ capturedAt: 1 }).lean();
};

// Static: get price trend (up/down/stable)
PriceSnapshotSchema.statics.getTrend = async function (bookId, source) {
  const snapshots = await this.find({ bookId, source, retailPrice: { $ne: null } })
    .sort({ capturedAt: -1 })
    .limit(10)
    .lean();

  if (snapshots.length < 2) return { trend: "insufficient_data", change: 0 };

  const newest = snapshots[0].retailPrice;
  const oldest = snapshots[snapshots.length - 1].retailPrice;
  const change = ((newest - oldest) / oldest) * 100;

  let trend = "stable";
  if (change > 3) trend = "rising";
  else if (change < -3) trend = "falling";

  return { trend, change: Math.round(change * 100) / 100, dataPoints: snapshots.length };
};

export default mongoose.model("PriceSnapshot", PriceSnapshotSchema);