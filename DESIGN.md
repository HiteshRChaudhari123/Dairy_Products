# DESIGN.md — Gavyora

> Project brief for UI work. Read before building or changing any screen. Update when you make a decision the next person needs.
> status: draft · last updated: 2026-10-07

## 1. Product and audience

- **What it is:** farm-fresh dairy e-commerce with daily milk subscriptions (India, Pune pilot). One site, four panels: store, delivery partner, admin, super admin.
- **Primary users:** households ordering on phones (mobile-first, 375px must work); admins and riders use the dashboard panels.
- **Business priorities:** trust and freshness ("at your door by 7 AM"), fast reorder/subscribe, clear prices in ₹.
- **Localisation:** English now, Hindi planned. `en-IN` formatting via `client/src/lib/format.js`; dates are IST.

## 2. Feel

- Premium, calm, "Midnight Navy & Platinum". Comfortable density on the store, compact in admin.
- Motion is subtle: `Reveal` fade-up on scroll, 200–700 ms transitions; always honour `prefers-reduced-motion`.
- Dark mode is required (`data-theme` on `<html>`); check both themes.

## 3. Tokens (`client/src/index.css`)

- Semantic colour tokens only (`bg-page`, `bg-surface`, `text-ink`, `text-muted`, `bg-primary`, `text-brand`, `accent`, `night`, `platinum`, status colours). Never hard-code hex in components (exceptions: banner `bg` from the DB, the printable invoice).
- `night` / `on-night` / `platinum` are the same in both themes: use them for fixed navy panels (deals panel, dashboard sidebar). `hero` / `hero-2` change with the theme (home hero, subscribe panel).
- Fonts: Playfair Display for headings (`font-heading`), Inter for UI. Utilities: `h-hero`, `h-page`, `h-section`, `eyebrow`.
- Components: `btn-primary`, `btn-outline`, `btn-premium` (on navy), `card`, `input`, `chip`, `badge-*`. Buttons ≥ 44px tall.

## 4. Stack

React 19 + Vite + Tailwind v4 · RTK Query (`client/src/app/api.js`, every endpoint) · React Router 7 · Recharts · lucide-react icons (stroke 1.5) · react-hot-toast · oxlint. No test runner yet (proposed: Vitest + Testing Library).

## 5. Where things live

- Shared primitives: `client/src/components/ui.jsx` (Modal, EmptyState, ErrorState, Skeleton, Tabs, Toggle, StatCard…), `ProductCard`, `ProductImage`, `Reveal`.
- Images: `client/src/lib/images.js` (`PHOTOS`, `categoryImage`). Unsplash URLs; verify an ID returns 200 before using it.
- Edited/own images: `client/public/banners/` (served at `/banners/...`), e.g. `ghee-luxe.jpg` = Pexels 20689436 (ghee jars with Ayurvedic ingredients on stone) mirrored so the subject sits on the right, and `ghee-luxe-dark.jpg` = Unsplash 1605880980331 (golden jar, warm bokeh) used as the banner's `imageDark`. `ghee-blue.jpg` is the previous version, no longer used by the seed.

## 6. Patterns already decided

| Topic | Decision | Date |
|---|---|---|
| Home hero | (Photo wash and wide fade replaced on 2026-10-11, see "Photos stay clear".) Follows the theme (brand reference: Midnight Navy & Platinum): `bg-hero` panel, sky blue (#DCEAFC, between page and header) with navy text in light mode, deep navy with platinum button in dark. Photo on the right fading in from the left, washed with `hero-2` (multiply) in light mode so all banners share one colour mood; crop anchored at 72% height by default; a banner's `imagePosition` (`center`/`right`/`left`, see `BANNER_POSITION` in `lib/images.js`) overrides it. For a product on the right, give the photo a wide canvas (~1.6:1) with the subject in the right third and set `right`, so it clears the headline fade on every width (the ghee banner does this). Optional `highlights` (≤3 short product facts, no invented numbers) float as glass badges in the gap between headline and photo, `xl` and up only (narrower screens have no gap). Prefer photos on light or sky-blue backgrounds (Pexels/Unsplash, free licences). Admin edits `eyebrow`, `title`, `subtitle`, `cta`, `link`, `image` (`bg` is no longer used). Autoplay pauses on hover/focus, is off for reduced motion, hidden slides are `inert`. | 2026-10-06 |
| Home sections | Hero → benefits → categories → best sellers → deals → subscribe & save → fresh picks → farm story → reviews → recently viewed. Each section hides itself when it has no data. | 2026-10-06 |
| Subscribe & save (home) | One fixed `night` panel in both themes: copy on the left (serif headline with an italic platinum second line, numbered 01–03 steps on hairlines, `btn-premium` CTA, perk icons), `PHOTOS.milkCrystal` (Pexels 14121496, milk in crystal glassware on black) on the right half from `lg` / a top band below, tinted `night/35` so its black matches the navy. A glass strip underneath lists 4 subscribable products (snap-scroll on phones, 2 cols `sm`, 4 cols `lg`). | 2026-10-06 |
| Product rows on phones | Horizontal snap scroll on phones, grid from `md`. | 2026-10-06 |
| Marketing claims | No invented numbers (customer counts, years). Use product facts (7 AM delivery, lab tested, no preservatives). | 2026-10-06 |
| Store header on phones | Theme toggle lives in the menu drawer below `sm` (header overflowed 375px). | 2026-10-06 |
| Page headers | Content pages open with `components/PageHero.jsx`, styled like the home hero so the site's sky blue carries through: a theme-aware `bg-hero` panel (sky blue + navy text in light, deep navy in dark), photo washed with `hero-2` (multiply) in light mode and fading in from the left from `md`; on phones the photo is a top band fading down into the panel (not under the text). Buttons: `btn-primary` + `btn-outline`. Breadcrumbs, eyebrow, serif title, subtitle, optional actions/children. `size="sm"` for listings and CMS pages. Used on Careers, Contact, Help centre, Categories, product listings (search/deals/category) and CMS pages (`PAGE_PHOTOS` in `lib/images.js` picks the photo per slug). Transactional pages (cart, checkout, account, wishlist) keep plain headers. | 2026-10-07 |
| Careers | `/careers` (footer + mobile drawer). Roles are a static list in `pages/info/Careers.jsx` (edit as roles open/close); apply opens an email to the support address, the delivery role links to `/delivery/register`. Team filter is URL state (`?team=`). The closing "Don't see the right role?" band uses `bg-hero` too. Perks/values copy needs owner review before launch. | 2026-10-07 |
| Product & category photos | Sky-blue studio look (blue backdrop, blue/white props, real flowers/herbs/fruit beside the product); prompts in `PRODUCT_PHOTO_PROMPTS.md`. Product photos: `client/public/products/<slug>.jpg`, 1600×1600, bump `IMAGE_VERSION` in `server/src/seed.js`. Category tiles: `client/public/categories/<slug>.jpg`, 800×1000 (4:5) crops of a hero product, bump `CATEGORY_PHOTO_VERSION` in `lib/images.js`. Dark mode: every product/category photo has a navy-studio version in `products/dark/` and `categories/dark/` (same file name); `themedImage(src, theme)` swaps it in, `isDarkPhoto` exempts it from the dark-mode dimming; bump `DARK_PHOTO_VERSION` when they change. | 2026-10-10 |
| Security audit page | `/superadmin/security`: overall status card, four status counts (click to filter), findings as expandable cards (status chip with icon + word, never colour alone; FAIL open by default; evidence in mono on `surface-2`), "By area" and dependency summary in the side column. Shows only real audit output. | 2026-10-10 |
| Page titles & SEO | `lib/meta.js`: layouts set per-route title, description, canonical, Open Graph and robots (store routes table; panels use the sidebar label, never indexed); pages refine with `usePageMeta` (product, category, CMS, invoice). Title format `Page · Gavyora`. | 2026-10-11 |
| Contact details | Phone, email and address come only from Global settings; each UI shows a `tel:`/`mailto:`/Maps link when set and hides it otherwise (no fallback numbers). `telHref()` adds +91 to 10-digit numbers. | 2026-10-11 |
| Images | Our photos are served as responsive WebP (`responsiveImage()` in `lib/images.js`, files from `npm run images`: products 480–1600px, quality 86) with intrinsic width/height; Unsplash/Pexels photos get a `w=` srcset (640–2560). Always pass a `sizes` that matches the real display width (too small = blurry on 2x/3x screens). Category listing headers use the category's best-selling product photo (the 800px tile is too small for a wide header); the first hero slide and page-hero photos load eagerly with high priority, everything else lazily. | 2026-10-11 |
| Photos stay clear | No tint, wash or dark gradient over photos. Text never sits on a photo: hero/page-hero copy keeps to the left half with only a thin edge blend, category names sit on a strip below the tile, the deals panel puts its photo above the copy. The AI product/category photos have a smeared bottom strip that `npm run images` trims automatically (originals untouched); bump `RESPONSIVE_VERSION` in `lib/images.js` after regenerating. | 2026-10-11 |
| Narrow grids | Single-column grids that hold cards use `grid-cols-1` (not bare `grid`) so long words can't widen the page; stat cards stack their icon below 420px. | 2026-10-11 |
| Loading / errors | Skeletons matching the layout; `ErrorState` with retry; empty lists use `EmptyState` with a next action. | |
| Money / dates | `formatINR`, `formatDate`; YYYY-MM-DD `dateKey` for delivery dates. | |

## 7. Open questions

- Lighthouse/axe pass and a test runner are not set up yet.
