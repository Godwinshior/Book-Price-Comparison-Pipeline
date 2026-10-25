import mongoose from "mongoose";

const SourcePriceSchema = new mongoose.Schema(
  {
    source: {
      type: String,
      enum: ["google_books", "open_library", "internet_archive"],
      required: true,
    },
    listPrice: { type: Number, default: null },
    retailPrice: { type: Number, default: null },
    currency: { type: String, default: "USD" },
    buyLink: { type: String, default: null },
    format: {
      type: String,
      enum: ["ebook", "paperback", "hardcover", "audiobook", "unknown"],
      default: "unknown",
    },
    available: { type: Boolean, default: false },
  },
  { _id: false }
);

const BookSchema = new mongoose.Schema(
  {
    isbn: { type: String, index: true, sparse: true },
    title: { type: String, required: true, index: "text" },
    authors: [String],
    publisher: String,
    publishedDate: String,
    description: String,
    pageCount: Number,
    categories: [String],
    thumbnail: String,
    language: { type: String, default: "en" },

    // Identifiers from various sources
    googleBooksId: { type: String, index: true, sparse: true },
    openLibraryKey: { type: String, index: true, sparse: true },

    // Current prices from all sources
    prices: [SourcePriceSchema],

    // Computed cheapest
    cheapestSource: String,
    cheapestPrice: Number,

    // Tracking metadata
    lastPriceCheck: Date,
    trackingEnabled: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  }
);

// Compound index for dedup
BookSchema.index({ title: 1, "authors.0": 1 });

// Method: recalculate cheapest price
BookSchema.methods.recalcCheapest = function () {
  const available = this.prices.filter(
    (p) => p.available && p.retailPrice != null
  );
  if (available.length === 0) {
    this.cheapestSource = null;
    this.cheapestPrice = null;
    return;
  }
  available.sort((a, b) => a.retailPrice - b.retailPrice);
  this.cheapestSource = available[0].source;
  this.cheapestPrice = available[0].retailPrice;
};

export default mongoose.model("Book", BookSchema);