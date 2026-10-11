import mongoose from 'mongoose'

const variantSchema = new mongoose.Schema({
  label: { type: String, required: true }, // e.g. "500 ml", "1 L", "200 g"
  price: { type: Number, required: true, min: 0 },
  mrp: { type: Number, required: true, min: 0 },
  stock: { type: Number, default: 0, min: 0 },
  sku: String,
})

const batchSchema = new mongoose.Schema({
  batchNo: String,
  mfgDate: Date,
  expiryDate: Date,
  qty: Number,
})

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true },
    description: String,
    highlights: [String],
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    brand: { type: String, default: 'Gavyora' },
    images: [String],
    variants: { type: [variantSchema], validate: [(v) => v.length > 0, 'Add at least one variant'] },
    price: { type: Number, default: 0 },
    mrp: { type: Number, default: 0 },
    fatPercent: Number,
    shelfLifeDays: Number,
    isOrganic: { type: Boolean, default: false },
    isA2: { type: Boolean, default: false },
    isVeg: { type: Boolean, default: true },
    isFeatured: { type: Boolean, default: false },
    isDeal: { type: Boolean, default: false },
    isSubscribable: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    tags: [String],
    rating: { type: Number, default: 0 },
    numReviews: { type: Number, default: 0 },
    sold: { type: Number, default: 0 },
    lowStockThreshold: { type: Number, default: 10 },
    batches: [batchSchema],
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } },
)

// Lowest variant price, stored so listings can sort/filter by price.
productSchema.pre('save', function () {
  if (this.variants?.length) {
    const cheapest = this.variants.reduce((a, b) => (b.price < a.price ? b : a))
    this.price = cheapest.price
    this.mrp = cheapest.mrp
  }
})
productSchema.virtual('totalStock').get(function () {
  return (this.variants || []).reduce((s, v) => s + v.stock, 0)
})

productSchema.index({ name: 'text', description: 'text', tags: 'text', brand: 'text' })
productSchema.index({ category: 1, isActive: 1 })

export default mongoose.model('Product', productSchema)
