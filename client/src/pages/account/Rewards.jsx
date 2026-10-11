import { Copy, Gift, Share2, ShoppingBag, UserPlus, Wallet } from 'lucide-react'
import toast from 'react-hot-toast'
import { useSelector } from 'react-redux'
import { selectUser } from '../../features/auth/authSlice'

const TIERS = [
  { name: 'Silver', min: 0, max: 100, emoji: '🥈' },
  { name: 'Gold', min: 100, max: 500, emoji: '🥇' },
  { name: 'Platinum', min: 500, max: Infinity, emoji: '💎' },
]

export default function Rewards() {
  const user = useSelector(selectUser)
  const points = user.loyaltyPoints || 0
  const tier = TIERS.find((t) => points >= t.min && points < t.max)
  const next = TIERS[TIERS.indexOf(tier) + 1]
  const progress = next ? ((points - tier.min) / (next.min - tier.min)) * 100 : 100
  const link = `${window.location.origin}/register?ref=${user.referralCode}`
  const shareText = `I get farm-fresh milk delivered every morning with Gavyora 🥛 Join with my code ${user.referralCode} and we both get a wallet bonus: ${link}`

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(user.referralCode)
      toast.success('Referral code copied')
    } catch {
      toast.error('Could not copy. Please copy it manually.')
    }
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Rewards & referral</h1>

      <div className="card overflow-hidden">
        <div className="bg-secondary-soft p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-muted">Loyalty points</p>
              <p className="font-heading text-4xl font-bold">{points}</p>
            </div>
            <div className="text-right">
              <p className="text-4xl">{tier.emoji}</p>
              <p className="font-semibold">{tier.name} member</p>
            </div>
          </div>
          <div className="mt-5">
            <div className="h-2.5 overflow-hidden rounded-full bg-surface">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(progress, 100)}%` }} />
            </div>
            <p className="mt-2 text-xs text-muted">
              {next ? `${next.min - points} more points to reach ${next.name} ${next.emoji}` : 'You are at our highest tier. Thank you!'}
            </p>
          </div>
        </div>
        <div className="grid gap-4 p-5 text-sm sm:grid-cols-3">
          <p>
            <b>Earn:</b> 1 point for every ₹100 spent on delivered orders.
          </p>
          <p>
            <b>Gold perks:</b> early access to deals and seasonal products.
          </p>
          <p>
            <b>Platinum perks:</b> free delivery on every order and priority support.
          </p>
        </div>
      </div>

      <div className="card p-5">
        <div className="flex items-center gap-2">
          <Gift className="size-5 text-brand" />
          <h2 className="text-lg font-semibold">Refer friends, earn wallet cash</h2>
        </div>
        <p className="mt-1 text-sm text-muted">Share your code. When a friend signs up with it, you both get a wallet bonus.</p>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <div className="flex flex-1 items-center justify-between rounded-xl border-2 border-dashed border-gold bg-selected px-4 py-3">
            <span className="font-heading text-xl font-bold tracking-widest text-brand">{user.referralCode}</span>
            <button className="btn-ghost btn-sm" onClick={copy} aria-label="Copy referral code">
              <Copy className="size-4" /> Copy
            </button>
          </div>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
            target="_blank"
            rel="noreferrer"
            className="btn bg-[#25D366] text-white hover:brightness-95"
          >
            <Share2 className="size-4" /> Share on WhatsApp
          </a>
        </div>

        <ol className="mt-6 grid gap-4 sm:grid-cols-3">
          {[
            [Share2, 'Share your code', 'Send it to friends and family on WhatsApp or SMS.'],
            [UserPlus, 'Friend signs up', 'They register on Gavyora using your code.'],
            [Wallet, 'You both earn', 'A wallet bonus lands in both accounts instantly.'],
          ].map(([Icon, title, text], i) => (
            <li key={title} className="flex gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-brand">
                <Icon className="size-5" />
              </span>
              <div>
                <p className="text-sm font-semibold">
                  {i + 1}. {title}
                </p>
                <p className="text-xs text-muted">{text}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <p className="flex items-center gap-2 text-xs text-muted">
        <ShoppingBag className="size-4" /> Points and bonuses are credited automatically, with nothing to claim.
      </p>
    </div>
  )
}
