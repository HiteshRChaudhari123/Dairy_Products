// Photography used across the store and panels (Unsplash and Pexels, both free to use).
export const unsplash = (id, w = 800) => `https://images.unsplash.com/photo-${id}?q=80&w=${w}&auto=format&fit=crop`

export const pexels = (id, w = 1200) => `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=${w}`

// Fallback photo per category slug, used when a category has no image of its own: 4:5 crops of the
// sky-blue product photos, in client/public/categories/<slug>.jpg. Bump the version when they change.
const CATEGORY_PHOTO_VERSION = 3
const CATEGORY_SLUGS = ['milk', 'curd-yogurt', 'paneer-tofu', 'ghee', 'butter-cream', 'cheese', 'buttermilk-lassi', 'ice-cream', 'sweets', 'organic-a2']

/** The category's own image, else our photo for its slug, else undefined (emoji tile). */
export const categoryImage = (c, theme = 'light') => {
  if (c?.image) return c.image
  if (!CATEGORY_SLUGS.includes(c?.slug)) return undefined
  return themedImage(`/categories/${c.slug}.jpg?v=${CATEGORY_PHOTO_VERSION}`, theme)
}

// Our own product and category photos have a dark-mode version (navy studio look) at
// /products/dark/<slug>.jpg and /categories/dark/<slug>.jpg. Bump the version when they change.
const DARK_PHOTO_VERSION = 2
const OWN_PHOTO = /^\/(products|categories)\/([a-z0-9-]+)\.jpg(\?.*)?$/

/** In dark mode, swap one of our product/category photos for its dark version; other URLs pass through. */
export const themedImage = (src, theme) => {
  if (theme !== 'dark' || !src) return src
  const m = OWN_PHOTO.exec(src)
  return m ? `/${m[1]}/dark/${m[2]}.jpg?v=${DARK_PHOTO_VERSION}` : src
}

/** True for photos that were made for dark mode, so the global dark-mode dimming skips them. */
export const isDarkPhoto = (src) => /^\/(products|categories)\/dark\//.test(src || '')

/**
 * Banner `imagePosition` → crop anchor. 'center' anchors low so portrait product shots keep their subject in view;
 * 'right'/'left' keep that edge of the photo visible on every screen width.
 */
export const BANNER_POSITION = {
  center: 'object-[50%_72%]',
  right: 'object-[100%_50%]',
  left: 'object-[0%_50%]',
}

export const PHOTOS = {
  farm: unsplash('1500595046743-cd271d694d30', 1400), // cows grazing at golden hour (heritage block)
  field: unsplash('1560493676-04071c5f467b', 1200),
  cow: unsplash('1570042225831-d98fa7577f1e', 1000),
  milkBottles: unsplash('1523473827533-2a64d0d36748', 1200),
  milkPour: unsplash('1550583724-b2692b85b150', 1000),
  milkBottle: unsplash('1576186726115-4d51596775d1', 800),
  breakfast: unsplash('1608198093002-ad4e005484ec', 1000),
  delivery: unsplash('1617347454431-f49d7ff5c3b1', 1200), // scooter rider at night
  milkCrystal: pexels(14121496, 1200), // milk in a glass bottle and crystal glasses on black (subscribe panel)
  milkGlass: unsplash('1517448931760-9bf4414148c5', 900), // glass of milk on dark wood (deals panel)
  team: unsplash('1521737604893-d14cc237f11d', 1600), // team working together at a long table (careers header)
  farmers: unsplash('1500937386664-56d1dfef3854', 1200), // handshake in a wheat field (farm partnerships)
  warehouse: unsplash('1553413077-190dd305871c', 1200), // warehouse aisles (operations)
  contact: unsplash('1423666639041-f56000c27a9a', 1600), // phone and laptop on a desk (contact header)
}

/** Header photo per CMS page slug (falls back to the farm photo). */
export const PAGE_PHOTOS = {
  about: PHOTOS.farm,
  terms: PHOTOS.milkBottles,
  privacy: PHOTOS.milkBottles,
  'refund-policy': PHOTOS.milkPour,
  'shipping-policy': PHOTOS.delivery,
}

// Our own photos have responsive WebP versions next to the JPG (made by `npm run images`).
// Bump RESPONSIVE_VERSION whenever the generated WebP files change (2: blurred bottom strip trimmed).
const RESPONSIVE_VERSION = 2
const OWN_JPG = /^\/(products|categories|banners)(\/dark)?\/([a-z0-9-]+)\.jpg(\?.*)?$/
// Up to the source size (products are 1600px squares), so large screens and 2x/3x displays get full detail.
const WIDTHS = { products: [480, 800, 1200, 1600], categories: [400, 800], banners: [960, 1600] }
// Intrinsic size of the largest version, so the browser can reserve space before the image loads.
const SIZE = { products: [1600, 1600], categories: [800, 1000], banners: [1600, 1000] }

// Unsplash and Pexels resize on request through the `w` parameter, so they get a width set too.
const CDN = /^https:\/\/images\.(unsplash|pexels)\.com\//
const CDN_WIDTHS = [640, 960, 1280, 1920, 2560]

/**
 * <img> attributes for a photo: for our own JPGs, WebP `src`/`srcSet` plus intrinsic width/height; for Unsplash/Pexels
 * a `srcSet` of widths; other URLs pass through unchanged. `sizes` must describe how wide the image is shown, so the
 * browser can pick a file sharp enough for the screen's pixel density.
 */
export function responsiveImage(src, sizes) {
  if (CDN.test(src || '') && /[?&]w=\d+/.test(src)) {
    const at = (w) => src.replace(/([?&])w=\d+/, `$1w=${w}`)
    return { src: at(1280), srcSet: CDN_WIDTHS.map((w) => `${at(w)} ${w}w`).join(', '), sizes }
  }
  const m = OWN_JPG.exec(src || '')
  if (!m) return { src }
  const [, kind, dark = '', name, query = ''] = m
  const ws = WIDTHS[kind]
  // RESPONSIVE_VERSION busts browser caches when `npm run images` output changes (the DB keeps the JPG URL).
  const url = (w) => `/${kind}${dark}/${name}-${w}.webp${query ? `${query}&` : '?'}r=${RESPONSIVE_VERSION}`
  const [width, height] = SIZE[kind]
  return { src: url(ws.at(-1)), srcSet: ws.map((w) => `${url(w)} ${w}w`).join(', '), sizes, width, height }
}
