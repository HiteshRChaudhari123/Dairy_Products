import {
  ArrowRight,
  BookOpen,
  Briefcase,
  Clock,
  HeartHandshake,
  Leaf,
  MapPin,
  Milk,
  ShieldCheck,
  Sprout,
  Sunrise,
  Users,
} from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { useSettingsQuery } from '../../app/api'
import PageHero from '../../components/PageHero'
import Reveal from '../../components/Reveal'
import { EmptyState, Tabs } from '../../components/ui'
import { PHOTOS, responsiveImage } from '../../lib/images'

// Edit this list as roles open and close. `apply: 'delivery'` sends people to the partner sign-up instead of email.
const ROLES = [
  {
    id: 'delivery-partner',
    title: 'Delivery partner',
    team: 'delivery',
    type: 'Flexible · morning shifts',
    location: 'Pune',
    text: 'Deliver fresh milk and dairy to homes in your neighbourhood between 6 and 10 AM, with weekly payouts to your bank account.',
    apply: 'delivery',
  },
  {
    id: 'warehouse-associate',
    title: 'Warehouse associate',
    team: 'operations',
    type: 'Full-time · early shift',
    location: 'Pune',
    text: 'Receive milk from partner farms, keep the cold room in order and pack each morning’s orders accurately and on time.',
  },
  {
    id: 'dispatch-lead',
    title: 'Dispatch & route lead',
    team: 'operations',
    type: 'Full-time',
    location: 'Pune',
    text: 'Plan the daily milk sheet, assign routes to delivery partners and make sure every order leaves the hub before sunrise.',
  },
  {
    id: 'quality-executive',
    title: 'Quality & lab executive',
    team: 'farm',
    type: 'Full-time',
    location: 'Pune & partner farms',
    text: 'Test every batch for purity and fat content, audit hygiene at partner farms and keep our FSSAI records up to date.',
  },
  {
    id: 'farmer-relations',
    title: 'Farmer relations associate',
    team: 'farm',
    type: 'Full-time · field role',
    location: 'Pune district',
    text: 'Build long-term relationships with local dairy farmers, onboard new farms and make sure they are paid fairly and on time.',
  },
  {
    id: 'customer-care',
    title: 'Customer care executive',
    team: 'care',
    type: 'Full-time · shifts',
    location: 'Pune',
    text: 'Help customers by phone, WhatsApp and tickets: subscriptions, deliveries, refunds. Calm, kind and quick to solve.',
  },
  {
    id: 'full-stack-developer',
    title: 'Full-stack developer (MERN)',
    team: 'tech',
    type: 'Full-time · hybrid',
    location: 'Pune',
    text: 'Build the website, delivery app and admin tools that run Gavyora every morning, with React, Node.js and MongoDB.',
  },
]

const TEAMS = [
  { value: '', label: 'All roles' },
  { value: 'delivery', label: 'Delivery' },
  { value: 'operations', label: 'Operations' },
  { value: 'farm', label: 'Farm & quality' },
  { value: 'care', label: 'Customer care' },
  { value: 'tech', label: 'Technology' },
]
const TEAM_LABEL = Object.fromEntries(TEAMS.map((t) => [t.value, t.label]))

const VALUES = [
  [Sunrise, 'Start the day early', 'Our work is done before most people wake up. Fresh milk at the door by 7 AM is the promise we keep together.'],
  [HeartHandshake, 'Fair to farmers', 'We buy directly from local dairy farmers and pay them fairly. Every role here helps that relationship last.'],
  [ShieldCheck, 'Quality first', 'Every batch is chilled, tested and handled with care. We would rather skip a delivery than send something we doubt.'],
  [Users, 'One team', 'Riders, packers, farm staff and developers solve problems together. Good ideas win, whoever has them.'],
]

const PERKS = [
  [Milk, 'Fresh dairy at home', 'Enjoy our milk and dairy products at team prices.'],
  [Clock, 'Shifts that suit you', 'Early-morning and flexible shifts that leave your day free.'],
  [BookOpen, 'Learn on the job', 'Hands-on training in food safety, operations and customer care.'],
  [Sprout, 'Grow with us', 'We are early. People who join now help shape how Gavyora grows.'],
]

const STEPS = [
  ['Apply', 'Send us your details for the role. Delivery partners can sign up online in a few minutes.'],
  ['Quick call', 'A short phone call with our team to get to know you and answer your questions.'],
  ['Meet the team', 'Visit the hub or farm, or a practical task for office and tech roles.'],
  ['Welcome aboard', 'An offer, your paperwork, and a first-week buddy to show you around.'],
]

function SectionTitle({ eyebrow, title, text }) {
  return (
    <div className="mb-6 max-w-2xl">
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="h-section mt-1.5">{title}</h2>
      {text && <p className="mt-1.5 text-sm text-muted">{text}</p>}
    </div>
  )
}

function RoleCard({ role, email }) {
  const subject = encodeURIComponent(`Application: ${role.title}`)
  const body = encodeURIComponent(`Hello Gavyora team,\n\nI would like to apply for the ${role.title} role.\n\nName:\nPhone:\nAbout me:\n`)
  return (
    <li className="card lift flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-heading text-xl font-semibold">{role.title}</h3>
        <span className="chip shrink-0 bg-accent-soft text-ink">{TEAM_LABEL[role.team]}</span>
      </div>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span className="flex items-center gap-1">
          <MapPin className="size-3.5" aria-hidden /> {role.location}
        </span>
        <span className="flex items-center gap-1">
          <Briefcase className="size-3.5" aria-hidden /> {role.type}
        </span>
      </p>
      <p className="mt-3 flex-1 text-sm leading-relaxed text-muted">{role.text}</p>
      <div className="mt-5">
        {role.apply === 'delivery' ? (
          <Link to="/delivery/register" className="btn-primary btn-sm">
            Sign up as a partner <ArrowRight className="size-4" />
          </Link>
        ) : (
          <a href={`mailto:${email}?subject=${subject}&body=${body}`} className="btn-outline btn-sm" aria-label={`Apply for ${role.title} by email`}>
            Apply by email <ArrowRight className="size-4" />
          </a>
        )}
      </div>
    </li>
  )
}

export default function Careers() {
  const { data: s } = useSettingsQuery()
  const [params, setParams] = useSearchParams()
  const team = params.get('team') || ''
  const roles = team ? ROLES.filter((r) => r.team === team) : ROLES
  const email = s?.supportEmail || 'care@gavyora.com'


  return (
    <div className="container-page py-5 sm:py-8">
      <PageHero
        image={PHOTOS.team}
        eyebrow="Careers at Gavyora"
        title="Grow with us, every morning"
        subtitle="Join the team that brings farm-fresh dairy to families across Pune: on the road, in the hub, at the farms and behind the screen."
        crumbs={[['Home', '/'], ['Careers']]}
        actions={
          <>
            <a href="#roles" className="btn-primary">
              See open roles <ArrowRight className="size-4" />
            </a>
            <Link to="/delivery/register" className="btn-outline bg-surface/40 backdrop-blur-sm">
              Become a delivery partner
            </Link>
          </>
        }
      />

      <Reveal as="section" className="mt-16 sm:mt-20" aria-label="Why work at Gavyora">
        <SectionTitle eyebrow="Why Gavyora" title="Work that people wake up to" text="What we care about, whatever team you join." />
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {VALUES.map(([Icon, title, text]) => (
            <li key={title} className="card p-5">
              <span className="flex size-11 items-center justify-center rounded-full bg-primary-soft text-brand">
                <Icon className="size-5" strokeWidth={1.5} aria-hidden />
              </span>
              <p className="mt-4 font-medium">{title}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted">{text}</p>
            </li>
          ))}
        </ul>
      </Reveal>

      <Reveal as="section" className="mt-16 grid items-center gap-8 sm:mt-20 lg:grid-cols-2 lg:gap-14">
        <div className="grid grid-cols-2 gap-3">
          <img {...responsiveImage(PHOTOS.farmers, '(min-width: 1024px) 600px, 100vw')} alt="Partner farmer and our team shaking hands in a field" loading="lazy" className="col-span-2 aspect-[16/9] w-full rounded-3xl object-cover" />
          <img {...responsiveImage(PHOTOS.warehouse, '(min-width: 1024px) 300px, 50vw')} alt="Our packing hub" loading="lazy" className="aspect-[4/3] w-full rounded-2xl object-cover" />
          <img {...responsiveImage(PHOTOS.delivery, '(min-width: 1024px) 300px, 50vw')} alt="A delivery partner on a scooter" loading="lazy" className="aspect-[4/3] w-full rounded-2xl object-cover" />
        </div>
        <div>
          <p className="eyebrow">Life at Gavyora</p>
          <h2 className="h-section mt-1.5">From the farm to the front door</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-muted">
            Our day starts at the farm, moves through the hub and ends at your door. Each team owns one part of that journey, and
            everyone can see how their work reaches a family’s breakfast table.
          </p>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {PERKS.map(([Icon, title, text]) => (
              <li key={title} className="flex gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-brand">
                  <Icon className="size-5" strokeWidth={1.5} aria-hidden />
                </span>
                <span>
                  <span className="block text-[15px] font-medium">{title}</span>
                  <span className="block text-[13px] text-muted">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </Reveal>

      <section id="roles" className="mt-16 scroll-mt-28 sm:mt-20" aria-labelledby="roles-title">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div className="max-w-2xl">
            <p className="eyebrow">Open roles</p>
            <h2 id="roles-title" className="h-section mt-1.5">
              Find your place on the team
            </h2>
          </div>
          <p className="text-sm text-muted" aria-live="polite">
            {roles.length} open role{roles.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className="mb-5">
          <Tabs tabs={TEAMS} value={team} onChange={(v) => setParams(v ? { team: v } : {}, { replace: true, preventScrollReset: true })} />
        </div>
        {roles.length ? (
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {roles.map((r) => (
              <RoleCard key={r.id} role={r} email={email} />
            ))}
          </ul>
        ) : (
          <div className="card">
            <EmptyState
              icon="🧑‍🌾"
              title="No open roles in this team right now"
              text="We still want to hear from you. Send us your details and we'll get in touch when something opens up."
              action={
                <button className="btn-outline" onClick={() => setParams({}, { replace: true, preventScrollReset: true })}>
                  Show all roles
                </button>
              }
            />
          </div>
        )}
      </section>

      <Reveal as="section" className="mt-16 sm:mt-20" aria-label="How hiring works">
        <SectionTitle eyebrow="How hiring works" title="Simple, quick and human" />
        <ol className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(([title, text], i) => (
            <li key={title} className="border-t border-line pt-4">
              <span className="font-heading text-2xl text-accent italic">{String(i + 1).padStart(2, '0')}</span>
              <span className="mt-1 block text-[15px] font-medium">{title}</span>
              <span className="mt-1 block text-[13px] leading-relaxed text-muted">{text}</span>
            </li>
          ))}
        </ol>
      </Reveal>

      <Reveal as="section" className="relative mt-16 overflow-hidden rounded-3xl border border-line bg-hero px-6 py-10 text-ink sm:mt-20 sm:px-10 lg:px-14">
        <Leaf className="pointer-events-none absolute -right-6 -bottom-8 size-48 text-brand/10" aria-hidden />
        <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="max-w-xl">
            <h2 className="font-heading text-[28px] leading-tight font-medium sm:text-[34px]">Don’t see the right role?</h2>
            <p className="mt-2 text-[15px] text-muted">
              Tell us what you’re great at. We read every message and get back to people who fit our next openings.
            </p>
          </div>
          <a
            href={`mailto:${email}?subject=${encodeURIComponent('Careers: general application')}`}
            className="btn-primary shrink-0"
          >
            Send us your details <ArrowRight className="size-4" />
          </a>
        </div>
      </Reveal>
    </div>
  )
}
