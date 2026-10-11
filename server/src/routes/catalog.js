// Public storefront data + admin catalogue management (categories, products, reviews, banners).
import { Router } from 'express'
import mongoose from 'mongoose'
import { z } from 'zod'
import { allow, can, optionalAuth, protect } from '../middleware/auth.js'
import { limits } from '../middleware/rateLimit.js'
import Category from '../models/Category.js'
import { Banner, Page, Setting } from '../models/misc.js'
import Order from '../models/Order.js'
import Product from '../models/Product.js'
import Review from '../models/Review.js'
import { escapeRegex, httpError, pick, slugify } from '../utils/http.js'
import { audit } from '../utils/services.js'

const router = Router()
const admin = [protect, allow('admin')]

// Links and images set by admins are rendered on the storefront, so only allow site paths and https URLs
// (no javascript:, data: or protocol-relative URLs).
const SAFE_URL = /^(\/(?!\/)[^\s]*|https:\/\/[^\s]+)$/
const safeUrl = (max = 500) => z.string().trim().max(max).refine((v) => v === '' || SAFE_URL.test(v), 'Use a site path like /c/ghee or an https:// URL')
const text = (max) => z.string().max(max)

const PUBLIC_SETTINGS = [
  'storeName',
  'supportPhone',
  'supportEmail',
  'address',
  'fssaiNo',
  'gstNo',
  'deliveryFee',
  'freeDeliveryAbove',
  'minOrderValue',
  'taxPercent',
  'codEnabled',
  'slots',
]

// ───────────── Storefront ─────────────

router.get('/home', async (_req, res) => {
  const base = { isActive: true }
  const [banners, categories, featured, deals, bestSellers, subscribable, testimonials] = await Promise.all([
    Banner.find({ isActive: true }).sort('sortOrder'),
    Category.find({ isActive: true }).sort('sortOrder'),
    Product.find({ ...base, isFeatured: true }).populate('category', 'name slug icon').limit(12),
    Product.find({ ...base, isDeal: true }).populate('category', 'name slug icon').limit(10),
    Product.find(base).sort('-sold').populate('category', 'name slug icon').limit(10),
    Product.find({ ...base, isSubscribable: true }).populate('category', 'name slug icon').limit(8),
    Review.find({ isApproved: true, rating: { $gte: 4 }, comment: { $ne: '' } })
      .sort('-createdAt')
      .limit(6)
      .populate('product', 'name slug'),
  ])
  res.json({ banners, categories, featured, deals, bestSellers, subscribable, testimonials })
})

router.get('/settings', async (_req, res) => {
  res.json(pick((await Setting.get()).toObject(), PUBLIC_SETTINGS))
})

router.get('/pages/:slug', async (req, res) => {
  const page = await Page.findOne({ slug: req.params.slug })
  if (!page) throw httpError(404, 'Page not found')
  res.json(page)
})

// ───────────── Categories ─────────────

router.get('/categories', async (req, res) => {
  const filter = req.query.all === '1' ? {} : { isActive: true }
  const categories = await Category.find(filter).sort('sortOrder name').lean()
  const counts = await Product.aggregate([
    { $match: { isActive: true } },
    { $group: { _id: '$category', n: { $sum: 1 } } },
  ])
  const byId = Object.fromEntries(counts.map((c) => [String(c._id), c.n]))
  res.json(categories.map((c) => ({ ...c, productCount: byId[String(c._id)] || 0 })))
})

const categorySchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: text(300).optional(),
  icon: text(8).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{3,8}$/, 'Use a hex colour like #EDF0F4').optional(),
  image: safeUrl().optional(),
  sortOrder: z.number().optional(),
  isActive: z.boolean().optional(),
})

router.post('/categories', ...admin, can('products'), async (req, res) => {
  const data = categorySchema.parse(req.body)
  const cat = await Category.create({ ...data, slug: slugify(data.name) })
  await audit(req, 'category.create', 'Category', cat._id, cat.name)
  res.status(201).json(cat)
})

router.put('/categories/:id', ...admin, can('products'), async (req, res) => {
  const data = categorySchema.partial().parse(req.body)
  const cat = await Category.findById(req.params.id)
  if (!cat) throw httpError(404, 'Category not found')
  cat.set(data)
  if (data.name) cat.slug = slugify(data.name)
  await cat.save()
  await audit(req, 'category.update', 'Category', cat._id, cat.name)
  res.json(cat)
})

router.delete('/categories/:id', ...admin, can('products'), async (req, res) => {
  if (await Product.exists({ category: req.params.id })) {
    throw httpError(400, 'Move or delete the products in this category first')
  }
  await Category.findByIdAndDelete(req.params.id)
  await audit(req, 'category.delete', 'Category', req.params.id)
  res.json({ message: 'Deleted' })
})

// ───────────── Products ─────────────

const SORTS = {
  popular: { sold: -1 },
  price_asc: { price: 1 },
  price_desc: { price: -1 },
  newest: { createdAt: -1 },
  rating: { rating: -1, numReviews: -1 },
}

async function buildProductFilter(q, includeInactive = false) {
  const filter = includeInactive ? {} : { isActive: true }
  if (q.category) {
    const cat = mongoose.isValidObjectId(q.category)
      ? { _id: q.category }
      : await Category.findOne({ slug: q.category })
    filter.category = cat?._id ?? null
  }
  if (q.q) {
    const rx = new RegExp(escapeRegex(q.q.trim().slice(0, 100)), 'i')
    filter.$or = [{ name: rx }, { tags: rx }, { brand: rx }, { description: rx }]
  }
  if (q.minPrice || q.maxPrice) {
    filter.price = {}
    if (Number.isFinite(Number(q.minPrice)) && q.minPrice) filter.price.$gte = Number(q.minPrice)
    if (Number.isFinite(Number(q.maxPrice)) && q.maxPrice) filter.price.$lte = Number(q.maxPrice)
  }
  if (Number.isFinite(Number(q.rating)) && q.rating) filter.rating = { $gte: Number(q.rating) }
  for (const flag of ['isOrganic', 'isA2', 'isFeatured', 'isDeal', 'isSubscribable']) {
    if (q[flag] === '1') filter[flag] = true
  }
  if (q.inStock === '1') filter['variants.stock'] = { $gt: 0 }
  if (q.brand) filter.brand = q.brand
  // Comma-separated slugs, e.g. the shopper's "recently viewed" list (slugs survive a reseed; ids don't).
  if (q.slugs) filter.slug = { $in: String(q.slugs).split(',').map((s) => s.trim()).filter(Boolean).slice(0, 20) }
  if (q.lowStock === '1') filter.$expr = { $lte: [{ $min: '$variants.stock' }, '$lowStockThreshold'] }
  return filter
}

router.get('/products', async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1)
  const limit = Math.min(60, Number(req.query.limit) || 20)
  const filter = await buildProductFilter(req.query)
  const [items, total, brands] = await Promise.all([
    Product.find(filter)
      .sort(SORTS[req.query.sort] || SORTS.popular)
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('category', 'name slug icon'),
    Product.countDocuments(filter),
    Product.distinct('brand', { isActive: true }),
  ])
  res.json({ items, total, page, pages: Math.ceil(total / limit), brands })
})

router.get('/products/suggest', async (req, res) => {
  const q = (req.query.q || '').trim().slice(0, 100)
  if (q.length < 2) return res.json([])
  const rx = new RegExp(escapeRegex(q), 'i')
  const items = await Product.find({ isActive: true, $or: [{ name: rx }, { tags: rx }] })
    .select('name slug price images category')
    .populate('category', 'name slug icon')
    .limit(8)
  res.json(items)
})

// Admin list includes inactive products.
router.get('/products/admin/list', ...admin, async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1)
  const limit = Math.min(100, Number(req.query.limit) || 20)
  const filter = await buildProductFilter(req.query, true)
  const [items, total] = await Promise.all([
    Product.find(filter)
      .sort(SORTS[req.query.sort] || { createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('category', 'name slug icon'),
    Product.countDocuments(filter),
  ])
  res.json({ items, total, page, pages: Math.ceil(total / limit) })
})

router.get('/products/:slug', optionalAuth, async (req, res) => {
  const key = req.params.slug
  // Hidden products are only visible to admins (the admin product form loads by id).
  const isAdmin = ['admin', 'superadmin'].includes(req.user?.role)
  const filter = mongoose.isValidObjectId(key) ? { _id: key } : { slug: key }
  if (!isAdmin) filter.isActive = true
  const product = await Product.findOne(filter).populate('category', 'name slug icon')
  if (!product) throw httpError(404, 'Product not found')
  const [reviews, similar] = await Promise.all([
    Review.find({ product: product._id, isApproved: true }).sort('-createdAt').limit(50),
    Product.find({ category: product.category._id, _id: { $ne: product._id }, isActive: true })
      .sort('-sold')
      .limit(8)
      .populate('category', 'name slug icon'),
  ])
  // "Frequently bought together": products that appear in the same orders most often.
  const together = await Order.aggregate([
    { $match: { 'items.product': product._id } },
    { $unwind: '$items' },
    { $match: { 'items.product': { $ne: product._id } } },
    { $group: { _id: '$items.product', n: { $sum: 1 } } },
    { $sort: { n: -1 } },
    { $limit: 3 },
  ])
  const boughtTogether = await Product.find({ _id: { $in: together.map((t) => t._id) }, isActive: true })
  res.json({ product, reviews, similar, boughtTogether })
})

const productSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: text(5000).optional(),
  highlights: z.array(text(120)).max(10).optional(),
  category: z.string().max(24),
  brand: text(60).optional(),
  images: z.array(safeUrl()).max(10).optional(),
  variants: z
    .array(
      z.object({
        _id: z.string().optional(),
        label: z.string().trim().min(1).max(30),
        price: z.number().min(0),
        mrp: z.number().min(0),
        stock: z.number().int().min(0),
        sku: text(40).optional(),
      }).refine((v) => v.price <= v.mrp, { message: 'Price cannot be more than MRP', path: ['price'] }),
    )
    .min(1, 'Add at least one variant')
    .max(20),
  fatPercent: z.number().optional(),
  shelfLifeDays: z.number().optional(),
  isOrganic: z.boolean().optional(),
  isA2: z.boolean().optional(),
  isVeg: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  isDeal: z.boolean().optional(),
  isSubscribable: z.boolean().optional(),
  isActive: z.boolean().optional(),
  tags: z.array(text(40)).max(30).optional(),
  lowStockThreshold: z.number().optional(),
})

async function assertCategory(id) {
  if (!mongoose.isValidObjectId(id) || !(await Category.exists({ _id: id }))) throw httpError(400, 'Choose a valid category')
}

router.post('/products', ...admin, can('products'), async (req, res) => {
  const data = productSchema.parse(req.body)
  await assertCategory(data.category)
  let slug = slugify(data.name)
  if (await Product.exists({ slug })) slug += '-' + Date.now().toString(36)
  const product = await Product.create({ ...data, slug })
  await audit(req, 'product.create', 'Product', product._id, product.name)
  res.status(201).json(product)
})

router.put('/products/:id', ...admin, can('products'), async (req, res) => {
  const data = productSchema.partial().parse(req.body)
  if (data.category) await assertCategory(data.category)
  const product = await Product.findById(req.params.id)
  if (!product) throw httpError(404, 'Product not found')
  product.set(data)
  await product.save()
  await audit(req, 'product.update', 'Product', product._id, product.name)
  res.json(product)
})

router.delete('/products/:id', ...admin, can('products'), async (req, res) => {
  const product = await Product.findByIdAndDelete(req.params.id)
  await Review.deleteMany({ product: req.params.id })
  await audit(req, 'product.delete', 'Product', req.params.id, product?.name)
  res.json({ message: 'Deleted' })
})

// Inventory: set stock for one variant, and add/remove batches with expiry dates.
router.patch('/products/:id/stock', ...admin, can('inventory'), async (req, res) => {
  const { variantId, stock } = z.object({ variantId: z.string(), stock: z.number().int().min(0) }).parse(req.body)
  const product = await Product.findById(req.params.id)
  const variant = product?.variants.id(variantId)
  if (!variant) throw httpError(404, 'Variant not found')
  const before = variant.stock
  variant.stock = stock
  await product.save()
  await audit(req, 'inventory.stock', 'Product', product._id, `${product.name} ${variant.label}: ${before} → ${stock}`)
  res.json(product)
})

router.post('/products/:id/batches', ...admin, can('inventory'), async (req, res) => {
  const data = z
    .object({ batchNo: z.string().trim().min(1).max(40), mfgDate: z.iso.date(), expiryDate: z.iso.date(), qty: z.number().int().min(0) })
    .parse(req.body)
  const product = await Product.findById(req.params.id)
  if (!product) throw httpError(404, 'Product not found')
  product.batches.push(data)
  await product.save()
  res.status(201).json(product)
})

router.delete('/products/:id/batches/:batchId', ...admin, can('inventory'), async (req, res) => {
  const product = await Product.findById(req.params.id)
  if (!product) throw httpError(404, 'Product not found')
  product.batches.pull(req.params.batchId)
  await product.save()
  res.json(product)
})

// ───────────── Reviews ─────────────

router.post('/products/:id/reviews', protect, limits.sensitive, async (req, res) => {
  const data = z
    .object({ rating: z.number().int().min(1).max(5), title: z.string().trim().max(120).optional(), comment: z.string().trim().max(2000).optional() })
    .parse(req.body)
  const productId = req.params.id
  if (!(await Product.exists({ _id: productId }))) throw httpError(404, 'Product not found')
  const purchased = await Order.exists({ user: req.user._id, status: 'delivered', 'items.product': productId })
  const review = await Review.findOneAndUpdate(
    { product: productId, user: req.user._id },
    // isApproved is left out so editing a review can't undo an admin hiding it (new reviews default to approved).
    { ...data, name: req.user.name, isVerifiedPurchase: !!purchased },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  )
  await Review.recalc(productId)
  res.status(201).json(review)
})

router.get('/reviews', ...admin, can('reviews'), async (req, res) => {
  const filter = {}
  if (req.query.approved === '0') filter.isApproved = false
  if (/^[1-5]$/.test(req.query.rating || '')) filter.rating = Number(req.query.rating)
  res.json(await Review.find(filter).sort('-createdAt').limit(200).populate('product', 'name slug'))
})

router.patch('/reviews/:id', ...admin, can('reviews'), async (req, res) => {
  const { isApproved } = z.object({ isApproved: z.boolean() }).parse(req.body)
  const review = await Review.findByIdAndUpdate(req.params.id, { isApproved }, { returnDocument: 'after' })
  if (!review) throw httpError(404, 'Review not found')
  await Review.recalc(review.product)
  await audit(req, isApproved ? 'review.approve' : 'review.hide', 'Review', review._id)
  res.json(review)
})

router.delete('/reviews/:id', ...admin, can('reviews'), async (req, res) => {
  const review = await Review.findByIdAndDelete(req.params.id)
  if (review) await Review.recalc(review.product)
  await audit(req, 'review.delete', 'Review', req.params.id)
  res.json({ message: 'Deleted' })
})

// ───────────── Banners ─────────────

const bannerSchema = z.object({
  eyebrow: z.string().max(40).optional(),
  title: z.string().trim().min(2).max(120),
  subtitle: text(300).optional(),
  cta: text(40).optional(),
  link: safeUrl().optional(),
  image: safeUrl().optional(),
  imageDark: safeUrl().optional(),
  imagePosition: z.enum(['center', 'left', 'right']).optional(),
  highlights: z.array(z.string().trim().min(1).max(32)).max(3).optional(),
  bg: z.string().regex(/^#[0-9a-fA-F]{3,8}$/).optional(),
  sortOrder: z.number().optional(),
  isActive: z.boolean().optional(),
})

router.get('/banners', ...admin, can('banners'), async (_req, res) => {
  res.json(await Banner.find().sort('sortOrder'))
})
router.post('/banners', ...admin, can('banners'), async (req, res) => {
  const banner = await Banner.create(bannerSchema.parse(req.body))
  await audit(req, 'banner.create', 'Banner', banner._id, banner.title)
  res.status(201).json(banner)
})
router.put('/banners/:id', ...admin, can('banners'), async (req, res) => {
  const banner = await Banner.findByIdAndUpdate(req.params.id, bannerSchema.partial().parse(req.body), { returnDocument: 'after' })
  if (!banner) throw httpError(404, 'Banner not found')
  await audit(req, 'banner.update', 'Banner', banner._id, banner.title)
  res.json(banner)
})
router.delete('/banners/:id', ...admin, can('banners'), async (req, res) => {
  await Banner.findByIdAndDelete(req.params.id)
  await audit(req, 'banner.delete', 'Banner', req.params.id)
  res.json({ message: 'Deleted' })
})

export default router
