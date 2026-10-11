// Demo data: categories, products, zones, coupons, banners, CMS pages and one account per role.
// Run against your own database with `npm run seed` (requires MONGO_URI). With no MONGO_URI the
// server seeds its in-memory database automatically on start.
import mongoose from 'mongoose'
import { fileURLToPath } from 'node:url'
import { env } from './config/env.js'
import { Plan, PlanVersion } from './models/billing.js'
import Category from './models/Category.js'
import Coupon from './models/Coupon.js'
import { AuditLog, Banner, Page, Setting, Ticket, WalletTransaction, Zone } from './models/misc.js'
import Order from './models/Order.js'
import Product from './models/Product.js'
import Review from './models/Review.js'
import Subscription from './models/Subscription.js'
import User, { PERMISSIONS } from './models/User.js'
import { addDays, dateKey, slugify } from './utils/http.js'

const CATEGORIES = [
  ['Milk', '🥛', '#EFE8DA', 'Fresh farm milk delivered every morning'],
  ['Curd & Yogurt', '🥣', '#efe8da', 'Thick, set curd and probiotic yogurts'],
  ['Paneer & Tofu', '🧀', '#efe8da', 'Soft, fresh paneer made daily'],
  ['Ghee', '🫙', '#efe8da', 'Bilona and cow ghee, slow-cooked'],
  ['Butter & Cream', '🧈', '#efe8da', 'White butter, table butter and fresh cream'],
  ['Cheese', '🧀', '#efe8da', 'Mozzarella, cheddar and cheese spreads'],
  ['Buttermilk & Lassi', '🥤', '#efe8da', 'Chaas, lassi and flavoured milk'],
  ['Ice Cream', '🍨', '#efe8da', 'Real-milk ice creams and kulfi'],
  ['Sweets', '🍮', '#efe8da', 'Traditional milk sweets'],
  ['Organic & A2', '🌿', '#efe8da', 'A2 cow milk and certified organic dairy'],
]

// Free Pexels licence, used for the hero banners.
const pexels = (id, w = 1600) => `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=${w}`

// [name, category index, variants [label, price, mrp, stock], extras]
const PRODUCTS = [
  // The first six "best sellers" (highest `sold`) are what the home page shows, in this order.
  ['Fresh Milk', 0, [['1 L', 60, 64, 150], ['500 ml', 32, 34, 200]], { fatPercent: 3, shelfLifeDays: 2, isSubscribable: true, isFeatured: true, tags: ['milk', 'toned', 'daily'], tagline: '100% Pure', sold: 1000 }],
  ['Full Cream Milk', 0, [['500 ml', 34, 36, 180], ['1 L', 66, 70, 120]], { fatPercent: 6, shelfLifeDays: 2, isSubscribable: true, isFeatured: true, tags: ['milk', 'full cream'] }],
  ['Double Toned Milk', 0, [['500 ml', 25, 26, 160], ['1 L', 48, 50, 90]], { fatPercent: 1.5, shelfLifeDays: 2, isSubscribable: true, tags: ['milk', 'low fat'] }],
  ['Buffalo Milk', 0, [['500 ml', 38, 40, 90], ['1 L', 74, 78, 60]], { fatPercent: 6.5, shelfLifeDays: 2, isSubscribable: true, tags: ['milk', 'buffalo'] }],
  ['Cow Milk (Glass Bottle)', 0, [['1 L', 72, 80, 40]], { fatPercent: 4, shelfLifeDays: 2, isSubscribable: true, isDeal: true, tags: ['milk', 'cow', 'glass bottle'] }],
  ['Fresh Set Curd', 1, [['400 g', 40, 45, 120], ['1 kg', 90, 100, 60]], { shelfLifeDays: 5, isSubscribable: true, isFeatured: true, tags: ['curd', 'dahi'] }],
  ['Greek Yogurt', 1, [['400 g', 140, 155, 70], ['100 g', 45, 50, 70]], { shelfLifeDays: 15, tags: ['yogurt', 'protein'], tagline: 'High Protein', sold: 980 }],
  ['Mishti Doi', 1, [['200 g', 55, 60, 50]], { shelfLifeDays: 7, isDeal: true, tags: ['sweet curd', 'bengali'] }],
  ['Paneer', 2, [['500 g', 180, 200, 40], ['200 g', 80, 90, 80]], { shelfLifeDays: 5, isFeatured: true, isDeal: true, tags: ['paneer', 'cottage cheese', 'malai'], tagline: 'Fresh & Soft', sold: 970 }],
  ['Low Fat Paneer', 2, [['200 g', 95, 105, 40]], { shelfLifeDays: 5, tags: ['paneer', 'low fat', 'protein'] }],
  ['Soya Tofu', 2, [['200 g', 70, 80, 30]], { shelfLifeDays: 10, tags: ['tofu', 'vegan'] }],
  ['A2 Bilona Cow Ghee', 3, [['500 ml', 899, 999, 40], ['1 L', 1699, 1899, 25]], { isA2: true, isOrganic: true, shelfLifeDays: 270, isFeatured: true, tags: ['ghee', 'a2', 'bilona'] }],
  ['Pure Cow Ghee', 3, [['200 ml', 169, 185, 70], ['500 ml', 399, 440, 60], ['1 L', 769, 850, 30]], { shelfLifeDays: 270, isDeal: true, tags: ['ghee', 'desi ghee'] }],
  ['Buffalo Ghee', 3, [['500 ml', 369, 410, 30]], { shelfLifeDays: 270, tags: ['ghee', 'buffalo'] }],
  ['White Butter (Makhan)', 4, [['200 g', 120, 130, 50]], { shelfLifeDays: 10, tags: ['butter', 'makhan', 'white butter'] }],
  ['Salted Table Butter', 4, [['100 g', 56, 60, 90], ['500 g', 275, 290, 40]], { shelfLifeDays: 90, isFeatured: true, tags: ['butter'] }],
  ['Fresh Cream', 4, [['200 ml', 65, 70, 45]], { shelfLifeDays: 7, tags: ['cream', 'malai'] }],
  ['Mozzarella Cheese', 5, [['200 g', 150, 170, 40]], { shelfLifeDays: 60, tags: ['cheese', 'pizza'] }],
  ['Cheese', 5, [['400 g', 230, 250, 35], ['200 g', 120, 130, 40]], { shelfLifeDays: 90, isDeal: true, tags: ['cheese', 'cheddar', 'block'], tagline: 'Premium Quality', sold: 960 }],
  ['Cheese Spread – Garlic', 5, [['180 g', 110, 120, 6]], { shelfLifeDays: 120, tags: ['cheese', 'spread'] }],
  ['Masala Chaas', 6, [['200 ml', 15, 15, 150], ['1 L', 60, 65, 50]], { shelfLifeDays: 4, isSubscribable: true, tags: ['buttermilk', 'chaas'] }],
  ['Sweet Lassi', 6, [['200 ml', 30, 35, 90]], { shelfLifeDays: 5, isFeatured: true, tags: ['lassi'] }],
  ['Mango Lassi', 6, [['200 ml', 35, 40, 70]], { shelfLifeDays: 5, isDeal: true, tags: ['lassi', 'mango'] }],
  ['Kesar Badam Milk', 6, [['200 ml', 40, 45, 60]], { shelfLifeDays: 5, tags: ['flavoured milk', 'badam'] }],
  ['Malai Kulfi', 7, [['4 pcs', 120, 140, 40]], { shelfLifeDays: 180, isFeatured: true, tags: ['kulfi', 'ice cream'] }],
  ['Vanilla Real Milk Ice Cream', 7, [['500 ml', 150, 175, 30], ['1 L', 280, 320, 20]], { shelfLifeDays: 180, tags: ['ice cream', 'vanilla'] }],
  ['Alphonso Mango Ice Cream', 7, [['500 ml', 180, 199, 25]], { shelfLifeDays: 180, isDeal: true, tags: ['ice cream', 'mango'] }],
  ['Kaju Katli', 8, [['250 g', 280, 310, 30]], { shelfLifeDays: 15, isFeatured: true, tags: ['sweets', 'mithai'] }],
  ['Rasgulla', 8, [['1 kg tin', 220, 250, 30]], { shelfLifeDays: 180, tags: ['sweets', 'rasgulla'] }],
  ['Milk Peda', 8, [['250 g', 180, 200, 8]], { shelfLifeDays: 10, isFeatured: true, tags: ['sweets', 'peda'] }],
  ['A2 Milk', 9, [['1 L', 120, 130, 70], ['500 ml', 62, 66, 100]], { isA2: true, isOrganic: true, fatPercent: 4.5, shelfLifeDays: 2, isSubscribable: true, isFeatured: true, tags: ['milk', 'a2', 'gir'], tagline: 'Rich in Nutrition', sold: 990 }],
  ['Organic Curd', 9, [['500 g', 70, 80, 40]], { isOrganic: true, shelfLifeDays: 5, isSubscribable: true, tags: ['curd', 'organic'] }],
  ['Organic Paneer', 9, [['200 g', 120, 135, 25]], { isOrganic: true, shelfLifeDays: 5, tags: ['paneer', 'organic'] }],
  ['Organic Butter', 4, [['500 g', 250, 275, 50], ['100 g', 60, 65, 80]], { isOrganic: true, shelfLifeDays: 30, tags: ['butter', 'organic', 'makhan'], tagline: 'Farm Fresh', sold: 950 }],
]

const DESCRIPTIONS = {
  0: 'Collected from our partner farms before sunrise, chilled within minutes and delivered to your door the same morning. No preservatives, no powder, just pure milk.',
  1: 'Set the traditional way in small batches for a thick, creamy texture and natural tang. Made only from fresh Gavyora milk.',
  2: 'Soft, fresh and full of protein. Made every morning and delivered chilled so it stays soft when you cook it.',
  3: 'Slow-cooked in small batches for a rich aroma and a grainy texture, the way ghee has always been made.',
  4: 'Churned from fresh cream for rich flavour. Great on parathas, toast and in your cooking.',
  5: 'Smooth, meltable cheese made from real milk. Perfect for pizzas, sandwiches and snacks.',
  6: 'Refreshing, cooling and good for digestion. Made from fresh curd with a hint of spice or sweetness.',
  7: 'Made with real milk and cream, not vegetable fat. Rich, creamy and made in small batches.',
  8: 'Traditional milk sweets made by our halwais with pure ghee and fresh khoya.',
  9: 'From native-breed cows raised on organic fodder. Gentle on digestion and full of goodness.',
}

// Product photos live in client/public/products/<slug>.jpg: each product photographed-style on its own
// sky-blue studio backdrop with natural props (see PRODUCT_PHOTO_PROMPTS.md for the look).
// Bump IMAGE_VERSION when the files are replaced so browsers don't show cached old photos.
const IMAGE_VERSION = 10
const productImage = (name) => `/products/${slugify(name)}.jpg?v=${IMAGE_VERSION}`

const TAGLINES = ['100% Pure & Natural', 'Thick & Creamy', 'Fresh & Soft', 'Rich & Aromatic', 'Farm Fresh', 'Premium Quality', 'Cool & Refreshing', 'Made with Real Cream', 'Made with Pure Ghee', 'Certified Organic']

const PAGES = [
  ['about', 'About Gavyora', 'Gavyora brings farm-fresh milk and dairy from partner farms straight to your door every morning.\n\nWe work directly with local dairy farmers, pay them fairly, and deliver within hours of milking, with no middlemen and no preservatives.'],
  ['terms', 'Terms & Conditions', 'By using Gavyora you agree to these terms. Replace this text with terms reviewed by your lawyer before launch.'],
  ['privacy', 'Privacy Policy', 'We collect only the information needed to deliver your orders. Replace this text with a policy reviewed by your lawyer before launch.'],
  ['refund-policy', 'Refund & Cancellation Policy', 'Orders can be cancelled until they are packed. Fresh dairy can be returned within 24 hours of delivery if there is a quality issue. Refunds go to your Gavyora wallet instantly.'],
  ['shipping-policy', 'Shipping & Delivery Policy', 'We deliver in selected pincodes during the time slot you choose. Morning subscription deliveries arrive between 6 and 8 AM.'],
]

/** Production bootstrap: create only the owner account (no demo data). */
export async function ensureSuperadmin() {
  if (await User.exists({ role: 'superadmin' })) return
  await Promise.all(mongoose.modelNames().map((n) => mongoose.model(n).syncIndexes()))
  await Setting.get()
  await User.create({ name: 'Gavyora Owner', email: env.superadminEmail, password: env.superadminPassword, role: 'superadmin' })
  console.log(`👑 Super admin created for ${env.superadminEmail}. Log in and change the password, then remove SUPERADMIN_PASSWORD from the environment.`)
}

/**
 * The shop catalogue: delivery zones, categories, products (with their photos), banners, coupons, CMS pages and the
 * subscription plans. No accounts, orders, reviews or wallet money. Used by the demo seed and, once, to stock a new
 * live store (SEED_CATALOG=true or `npm run seed:catalog`). `plansStatus: 'draft'` keeps the demo plans (invented
 * prices and terms) off sale until the owner reviews and publishes them.
 */
export async function seedCatalog({ plansStatus = 'published' } = {}) {
  const zones = await Zone.insertMany([
    { name: 'Central', branch: 'Main Warehouse', pincodes: ['411001', '411002', '411004', '411005', '411011'] },
    { name: 'West', branch: 'Main Warehouse', pincodes: ['411038', '411045', '411052', '411057'] },
    { name: 'East', branch: 'East Hub', pincodes: ['411006', '411014', '411028', '411036'], extraFee: 10 },
  ])

  const cats = await Category.insertMany(
    CATEGORIES.map(([name, icon, color, description], i) => ({ name, slug: slugify(name), icon, color, description, sortOrder: i })),
  )

  const products = []
  for (const [i, [name, ci, variants, { tagline, ...extra }]] of PRODUCTS.entries()) {
    products.push(
      await Product.create({
        name,
        slug: slugify(name),
        category: cats[ci]._id,
        description: DESCRIPTIONS[ci],
        images: [productImage(name)],
        highlights: [tagline || TAGLINES[ci], 'No preservatives', 'Hygienically packed', 'Lab tested for purity'],
        variants: variants.map(([label, price, mrp, stock], vi) => ({
          label,
          price,
          mrp,
          stock,
          sku: `GV-${String(i + 1).padStart(3, '0')}-${vi + 1}`,
        })),
        sold: Math.floor(Math.random() * 400),
        batches: [
          {
            batchNo: `B${2600 + i}`,
            mfgDate: addDays(new Date(), -1),
            expiryDate: addDays(new Date(), extra.shelfLifeDays > 3 ? Math.min(extra.shelfLifeDays, 30) : 2),
            qty: variants[0][3],
          },
        ],
        ...extra,
      }),
    )
  }

  // Hero banners follow the site theme (sky blue in light mode, navy in dark), fade the photo in from the
  // left and tint it to match, so photos on light or sky-blue backgrounds blend best.
  // Ghee banner (client/public/banners): ghee-luxe.jpg is Pexels 20689436 mirrored and set into a wider stone canvas;
  // ghee-luxe-dark.jpg is Unsplash 1605880980331 (golden jar on a moody wooden bar) widened the same way. Both keep
  // the jars in the right third, so with imagePosition 'right' they stay clear of the headline fade at every width.
  await Banner.insertMany([
    { eyebrow: 'Premium dairy products', title: 'Pure Goodness, Naturally.', subtitle: 'Fresh, healthy and premium dairy from our partner farms, collected at dawn and at your door by 7 AM.', cta: 'Shop Now', link: '/search', image: pexels(248412, 1600), imageDark: '/banners/milk-dark.jpg', sortOrder: 0 },
    { eyebrow: 'Slow-churned tradition', title: 'Pure Bilona Ghee for Your Kitchen', subtitle: 'Slow-churned the traditional way from A2 Gir cow milk, with a rich aroma and a grainy texture.', cta: 'Shop Ghee', link: '/c/ghee', image: '/banners/ghee-luxe.jpg', imageDark: '/banners/ghee-luxe-dark.jpg', imagePosition: 'right', highlights: ['A2 Gir cow milk', 'Hand-churned bilona', 'Lab tested for purity'], sortOrder: 1 },
    { eyebrow: 'Welcome offer', title: 'Goodness from Our Farms', subtitle: 'Milk, cheese, butter and more from local farms. Flat ₹50 off your first order above ₹299 with code WELCOME50.', cta: 'Shop Deals', link: '/deals', image: pexels(18325774, 1600), imageDark: '/banners/cheese-dark.jpg', sortOrder: 2 },
  ])

  await Coupon.insertMany([
    { code: 'WELCOME50', description: 'Flat ₹50 off on your first order above ₹299', type: 'flat', value: 50, minOrder: 299 },
    { code: 'FRESH10', description: '10% off up to ₹100 on orders above ₹499', type: 'percent', value: 10, maxDiscount: 100, minOrder: 499 },
    { code: 'GHEE15', description: '15% off up to ₹250 on orders above ₹799', type: 'percent', value: 15, maxDiscount: 250, minOrder: 799 },
  ])

  await Page.insertMany(PAGES.map(([slug, title, content]) => ({ slug, title, content })))

  // ── Demo plans (development data only: real prices, benefits and policies are set by the owner in the panel) ──
  const owner = await User.findOne({ role: 'superadmin' })
  const published = plansStatus === 'published'
  const demoPlan = async (kind, sortOrder, version) => {
    const plan = await Plan.create({ kind, name: version.name, slug: slugify(version.name), status: published ? 'published' : 'draft', sortOrder, latestVersion: 1, createdBy: owner?._id })
    const v = await PlanVersion.create({ ...version, plan: plan._id, version: 1, status: published ? 'published' : 'draft', publishedAt: published ? new Date() : undefined, createdBy: owner?._id })
    if (published) {
      plan.publishedVersion = v._id
      await plan.save()
    }
    return plan
  }
  const policy = (over = {}) => ({
    pause: { allowed: true, minDays: 1, maxDays: 30, noticeDays: 0 },
    cancellation: { mode: 'end_of_term', refund: 'none', refundUnusedBalance: true },
    renewal: { autoRenewAllowed: true },
    gracePeriodDays: 3,
    retry: { attempts: 3, intervalHours: 24 },
    ...over,
  })
  await demoPlan('membership', 0, {
    name: 'Gavyora Plus Monthly',
    tagline: 'Free delivery and member prices for a month',
    description: 'Member discount on every store order and free delivery above a small minimum.',
    termsText: 'Demo terms for development. Replace with terms reviewed by your lawyer before launch.',
    priceMinor: 9900,
    interval: 'month',
    durationDays: 30,
    taxPercent: 18,
    benefits: { discountPercent: 5, maxDiscountPerOrderMinor: 10000, freeDelivery: true, freeDeliveryMinOrderMinor: 9900, prioritySupport: true, perks: ['Early access to new products'] },
    policies: policy(),
  })
  await demoPlan('membership', 1, {
    name: 'Gavyora Plus Yearly',
    tagline: 'All Plus benefits for a year',
    description: 'The same benefits as Plus Monthly, billed once a year.',
    termsText: 'Demo terms for development. Replace with terms reviewed by your lawyer before launch.',
    priceMinor: 99900,
    interval: 'year',
    durationDays: 365,
    taxPercent: 18,
    benefits: { discountPercent: 7, maxDiscountPerOrderMinor: 15000, freeDelivery: true, freeDeliveryMinOrderMinor: 0, prioritySupport: true, perks: ['Early access to new products'] },
    policies: policy({ cancellation: { mode: 'immediate', refund: 'prorata', refundUnusedBalance: true } }),
  })
  const milk = products.filter((p) => ['Fresh Milk', 'Full Cream Milk', 'Double Toned Milk', 'Buffalo Milk', 'A2 Milk', 'Cow Milk (Glass Bottle)'].includes(p.name))
  await demoPlan('product', 2, {
    name: 'Daily Milk Prepaid',
    tagline: 'Fresh milk every morning, paid monthly in advance',
    description: 'Choose your milk and days. Pay for 30 days of deliveries up front; skipped days stay in your balance.',
    termsText: 'Demo terms for development. Unused balance is refunded to your wallet if you cancel.',
    priceMinor: 0,
    interval: 'month',
    durationDays: 30,
    product: { billingMode: 'prepaid', eligible: milk.map((p) => ({ product: p._id })), discountPercent: 5, minQty: 1, maxQty: 6, maxItems: 2, frequencies: ['daily', 'alternate', 'custom'], deliveryFeeMinor: 0, prepayDays: 30 },
    policies: policy({ pause: { allowed: true, minDays: 1, maxDays: 45, noticeDays: 0 } }),
  })
  await demoPlan('product', 3, {
    name: 'Weekly Dairy Basket',
    tagline: 'Mix milk, curd, chaas and more in one basket',
    description: 'Build a basket of up to 6 products delivered on the days you choose. Pay as you go from your wallet.',
    termsText: 'Demo terms for development.',
    priceMinor: 0,
    interval: 'month',
    durationDays: 30,
    product: { billingMode: 'per_delivery', eligible: [], discountPercent: 0, minQty: 1, maxQty: 10, maxItems: 6, frequencies: ['daily', 'alternate', 'weekly', 'custom'], deliveryFeeMinor: 0, prepayDays: 30 },
    policies: policy(),
  })

  return { zones, cats, products }
}

/**
 * Stock a live store with the catalogue once: only when it has no categories and no products yet, so it can never
 * overwrite or duplicate what the owner has added. Plans arrive as drafts for the owner to review and publish.
 */
export async function stockCatalogIfEmpty() {
  if ((await Category.exists({})) || (await Product.exists({}))) {
    console.log('🛒 SEED_CATALOG: the store already has categories or products, so nothing was added. You can remove SEED_CATALOG.')
    return false
  }
  await Setting.get()
  const { products } = await seedCatalog({ plansStatus: 'draft' })
  console.log(`🛒 Catalogue added: ${products.length} products with photos, categories, banners, zones, coupons, pages and draft plans. Remove SEED_CATALOG now.`)
  return true
}

export async function seed({ reset = true } = {}) {
  if (reset) await mongoose.connection.db.dropDatabase()
  await Promise.all(mongoose.modelNames().map((n) => mongoose.model(n).syncIndexes()))
  await Setting.create({ key: 'global' })
  const { zones, products } = await seedCatalog()

  // ── Accounts (one per role) ──
  await User.create({ name: 'Gavyora Owner', email: env.superadminEmail, password: env.superadminPassword, role: 'superadmin' })
  await User.create({ name: 'Store Manager', email: 'admin@gavyora.com', phone: '9876500000', password: 'Admin@123', role: 'admin', permissions: PERMISSIONS })
  const rider = await User.create({
    name: 'Ravi Kumar',
    email: 'rider@gavyora.com',
    phone: '9876500001',
    password: 'Delivery@123',
    role: 'delivery',
    delivery: { vehicle: 'Bike MH12 AB 1234', licenseNo: 'MH1220200001', aadhaarLast4: '4321', bankAccountLast4: '7788', ifsc: 'HDFC0001234', kycStatus: 'approved', isOnline: true, zone: zones[0]._id },
  })
  await User.create({
    name: 'Suresh Patil',
    email: 'rider2@gavyora.com',
    phone: '9876500002',
    password: 'Delivery@123',
    role: 'delivery',
    delivery: { vehicle: 'Scooter MH12 CD 5678', licenseNo: 'MH1220210002', aadhaarLast4: '8765', bankAccountLast4: '1122', ifsc: 'SBIN0004567', kycStatus: 'pending' },
  })
  const customer = await User.create({
    name: 'Priya Sharma',
    email: 'customer@gavyora.com',
    phone: '9876543210',
    password: 'Customer@123',
    wallet: 500,
    loyaltyPoints: 42,
    addresses: [
      { label: 'Home', name: 'Priya Sharma', phone: '9876543210', line1: 'Flat 302, Green Meadows', line2: 'MG Road', landmark: 'Near City Park', city: 'Pune', state: 'Maharashtra', pincode: '411001', isDefault: true },
      { label: 'Office', name: 'Priya Sharma', phone: '9876543210', line1: '5th Floor, Tech Park', city: 'Pune', state: 'Maharashtra', pincode: '411014' },
    ],
  })
  await WalletTransaction.create({ user: customer._id, type: 'credit', amount: 500, reason: 'Welcome wallet credit', balanceAfter: 500 })

  // A few more customers for the admin panel.
  const names = ['Amit Verma', 'Neha Joshi', 'Rahul Deshmukh', 'Sneha Kulkarni', 'Vikram Singh', 'Anjali Mehta']
  const others = []
  for (const [i, name] of names.entries()) {
    const pin = [...zones[i % 3].pincodes][i % 3]
    others.push(
      await User.create({
        name,
        email: `${name.split(' ')[0].toLowerCase()}@example.com`,
        phone: `98220000${String(i).padStart(2, '0')}`,
        password: 'Customer@123',
        wallet: 100 * i,
        addresses: [{ name, phone: `98220000${String(i).padStart(2, '0')}`, line1: `${10 + i}, Sunrise Society`, city: 'Pune', state: 'Maharashtra', pincode: pin, isDefault: true }],
      }),
    )
  }

  // ── Past orders over the last 14 days (for dashboards, history and reviews) ──
  const buyers = [customer, ...others]
  const statuses = ['delivered', 'delivered', 'delivered', 'delivered', 'cancelled', 'delivered']
  for (let day = 13; day >= 0; day--) {
    const perDay = 2 + ((day * 7) % 4)
    for (let k = 0; k < perDay; k++) {
      const buyer = buyers[(day + k) % buyers.length]
      const picks = [products[(day + k) % products.length], products[(day * 3 + k + 5) % products.length]]
      const items = picks.map((p) => {
        const v = p.variants[0]
        return { product: p._id, name: p.name, category: CATEGORIES[PRODUCTS.find((x) => x[0] === p.name)[1]][0], variantId: v._id, variantLabel: v.label, price: v.price, mrp: v.mrp, qty: 1 + ((day + k) % 3) }
      })
      const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0)
      const deliveryFee = subtotal >= 299 ? 0 : 25
      const createdAt = addDays(new Date(), -day)
      createdAt.setHours(7 + k, 15 * k, 0, 0)
      const recent = day === 0
      const status = recent ? ['placed', 'confirmed', 'packed', 'out_for_delivery'][k % 4] : statuses[(day + k) % statuses.length]
      const addr = buyer.addresses[0].toObject()
      delete addr._id
      const method = ['cod', 'online', 'wallet'][(day + k) % 3]
      await Order.create({
        user: buyer._id,
        items,
        address: addr,
        slot: { date: dateKey(createdAt), label: '6:00 AM - 8:00 AM' },
        subtotal,
        deliveryFee,
        total: subtotal + deliveryFee,
        payment: { method, status: status === 'delivered' || method !== 'cod' ? (status === 'cancelled' && method !== 'cod' ? 'refunded' : 'paid') : 'pending' },
        status,
        deliveryPartner: status === 'placed' ? undefined : rider._id,
        deliveredAt: status === 'delivered' ? addDays(createdAt, 0) : undefined,
        codCollected: status === 'delivered' && method === 'cod',
        timeline: [
          { status: 'placed', note: 'Order placed', at: createdAt, by: 'system' },
          ...(status !== 'placed' ? [{ status, at: createdAt, by: 'system' }] : []),
        ],
        createdAt,
      })
    }
  }
  const deliveredCount = await Order.countDocuments({ deliveryPartner: rider._id, status: 'delivered' })
  rider.delivery.earnings = deliveredCount * 20
  rider.delivery.paidOut = Math.max(0, (deliveredCount - 8) * 20)
  await rider.save()

  // ── Reviews ──
  const REVIEWS = [
    [5, 'Tastes like village milk', 'Fresh every single morning and the delivery is always before 7. My kids love it.'],
    [5, 'Best ghee I have bought online', 'Grainy texture and the aroma fills the kitchen. Worth every rupee.'],
    [4, 'Soft paneer', 'Very soft and fresh. Would love a bigger pack size.'],
    [5, 'Subscription is so convenient', 'Pausing when we travel is just one tap. Great service.'],
    [4, 'Thick curd', 'Sets perfectly, just like homemade.'],
  ]
  const reviewed = [products[0], products[11], products[8], products[30], products[5]]
  for (const [i, p] of reviewed.entries()) {
    for (const [j, u] of buyers.slice(0, 3).entries()) {
      const [rating, title, comment] = REVIEWS[(i + j) % REVIEWS.length]
      await Review.create({ product: p._id, user: u._id, name: u.name, rating: j === 2 ? Math.max(3, rating - 1) : rating, title, comment, isVerifiedPurchase: true })
    }
    await Review.recalc(p._id)
  }

  // ── Subscriptions ──
  const addr = customer.addresses[0].toObject()
  delete addr._id
  const tomorrow = dateKey(addDays(new Date(), 1))
  await Subscription.create({
    user: customer._id,
    product: products[0]._id,
    variantId: products[0].variants[1]._id,
    variantLabel: products[0].variants[1].label,
    productName: products[0].name,
    price: products[0].variants[1].price,
    qty: 1,
    frequency: 'daily',
    startDate: dateKey(addDays(new Date(), -20)),
    address: addr,
  })
  await Subscription.create({
    user: customer._id,
    product: products[5]._id,
    variantId: products[5].variants[0]._id,
    variantLabel: products[5].variants[0].label,
    productName: products[5].name,
    price: products[5].variants[0].price,
    qty: 1,
    frequency: 'custom',
    days: [0, 3, 6],
    startDate: tomorrow,
    address: addr,
  })
  for (const [i, u] of others.entries()) {
    const p = products[[0, 1, 30, 3][i % 4]]
    const a = u.addresses[0].toObject()
    delete a._id
    await Subscription.create({
      user: u._id,
      product: p._id,
      variantId: p.variants[i % p.variants.length]._id,
      variantLabel: p.variants[i % p.variants.length].label,
      productName: p.name,
      price: p.variants[i % p.variants.length].price,
      qty: 1 + (i % 2),
      frequency: i % 3 === 0 ? 'alternate' : 'daily',
      startDate: dateKey(addDays(new Date(), -10)),
      address: a,
    })
  }

  await Ticket.create({
    user: customer._id,
    subject: 'Milk packet was leaking',
    messages: [{ from: customer._id, name: customer.name, role: 'customer', text: "Yesterday's 1 L packet was leaking. Please check." }],
  })
  await AuditLog.create({ actorName: 'system', role: 'system', action: 'seed', details: 'Demo data created' })

  console.log('🌱 Demo data seeded')
}

// `npm run seed`
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!env.mongoUri) {
    console.log('Set MONGO_URI in server/.env to seed a real database. (Without it, `npm run dev` seeds an in-memory DB automatically.)')
    process.exit(1)
  }
  await mongoose.connect(env.mongoUri)
  if (process.argv.includes('--catalog')) {
    // `npm run seed:catalog`: products, categories, banners… without any demo accounts or orders.
    await stockCatalogIfEmpty()
  } else if (env.isProd && !process.argv.includes('--allow-demo')) {
    // Demo accounts have published passwords; never load them into a live store by accident.
    await ensureSuperadmin()
    console.log('Production: created the super admin only. Pass --allow-demo to load demo data (not recommended).')
  } else {
    await seed({ reset: process.argv.includes('--reset') || (await User.countDocuments()) === 0 })
  }
  await mongoose.disconnect()
}
