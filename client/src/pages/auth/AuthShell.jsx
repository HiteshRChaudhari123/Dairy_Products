import { CheckCircle2 } from 'lucide-react'
import { LogoMark } from '../../components/Logo'
import { PHOTOS, responsiveImage } from '../../lib/images'

const BENEFITS = [
  'Farm-fresh milk at your door by 7 AM',
  'Subscribe once, pause anytime',
  'Instant refunds to your wallet',
  'Cash on delivery, UPI and cards',
]

/** Split card used by the auth pages: brand panel on the left (desktop), form on the right. */
export default function AuthShell({ title, subtitle, children }) {
  return (
    <div className="container-page py-6 sm:py-10">
      <div className="card mx-auto grid max-w-4xl overflow-hidden md:grid-cols-2">
        <div className="relative hidden flex-col justify-between overflow-hidden bg-night p-8 text-white md:flex">
          <img {...responsiveImage(PHOTOS.farm, '448px')} alt="" className="absolute inset-0 size-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-night/90 via-night/45 to-night/90" />
          <div className="relative">
            <div className="flex items-center gap-2">
              <LogoMark className="size-10" />
              <span className="font-heading text-2xl font-bold">Gavyora</span>
            </div>
            <p className="mt-6 font-heading text-2xl leading-snug font-semibold">
              Farm-fresh.
              <br />
              Every morning.
            </p>
          </div>
          <ul className="relative space-y-3 text-sm text-white/90">
            {BENEFITS.map((b) => (
              <li key={b} className="flex items-center gap-2">
                <CheckCircle2 className="size-4 shrink-0 text-secondary" /> {b}
              </li>
            ))}
          </ul>
        </div>
        <div className="p-5 sm:p-8">
          <h1 className="text-2xl font-bold">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  )
}
