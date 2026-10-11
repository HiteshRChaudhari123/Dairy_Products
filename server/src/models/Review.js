import mongoose from 'mongoose'

const reviewSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: String,
    rating: { type: Number, min: 1, max: 5, required: true },
    title: String,
    comment: String,
    isVerifiedPurchase: { type: Boolean, default: false },
    isApproved: { type: Boolean, default: true },
  },
  { timestamps: true },
)

reviewSchema.index({ product: 1, user: 1 }, { unique: true })

reviewSchema.statics.recalc = async function (productId) {
  const [agg] = await this.aggregate([
    { $match: { product: new mongoose.Types.ObjectId(String(productId)), isApproved: true } },
    { $group: { _id: null, avg: { $avg: '$rating' }, n: { $sum: 1 } } },
  ])
  await mongoose.model('Product').findByIdAndUpdate(productId, {
    rating: agg ? Math.round(agg.avg * 10) / 10 : 0,
    numReviews: agg ? agg.n : 0,
  })
}

export default mongoose.model('Review', reviewSchema)
