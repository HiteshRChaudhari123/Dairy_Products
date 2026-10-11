import { ArrowLeft, ArrowRight, Bike, CalendarClock, Check, IndianRupee, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { useDispatch } from 'react-redux'
import { Link, useNavigate } from 'react-router-dom'
import { errorMessage, useRegisterDeliveryMutation } from '../../app/api'
import { Field } from '../../components/ui'
import { setUser } from '../../features/auth/authSlice'
import { PHOTOS, responsiveImage } from '../../lib/images'

const STEPS = ['Personal details', 'Vehicle & licence', 'KYC & bank']

const BENEFITS = [
  [IndianRupee, 'Earn per delivery', 'Get paid for every drop, plus incentives on busy days.'],
  [CalendarClock, 'Flexible morning shifts', 'Deliver between 6 and 10 AM and keep the rest of your day free.'],
  [ShieldCheck, 'Weekly payouts', 'Earnings go straight to your bank account every week.'],
]

export default function Register() {
  const [step, setStep] = useState(0)
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    password: '',
    vehicle: '',
    licenseNo: '',
    aadhaarLast4: '',
    bankAccountLast4: '',
    ifsc: '',
  })
  const [register, { isLoading }] = useRegisterDeliveryMutation()
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const set = (k, clean) => (e) => setForm((f) => ({ ...f, [k]: clean ? clean(e.target.value) : e.target.value }))
  const digits = (n) => (v) => v.replace(/\D/g, '').slice(0, n)

  const next = (e) => {
    e.preventDefault()
    if (step < STEPS.length - 1) return setStep(step + 1)
    submit()
  }

  const submit = async () => {
    try {
      const res = await register({ ...form, ifsc: form.ifsc.toUpperCase() }).unwrap()
      dispatch(setUser(res.user))
      toast.success('Application submitted! We will verify your KYC shortly.')
      navigate('/delivery')
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <div className="container-page py-6">
      <div className="grid items-start gap-8 lg:grid-cols-2 lg:gap-12">
        <section className="relative overflow-hidden rounded-3xl bg-night p-6 text-white sm:p-10">
          <img {...responsiveImage(PHOTOS.delivery, '(min-width: 1024px) 50vw, 100vw')} alt="" className="absolute inset-0 size-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-night/95 via-night/85 to-night/95" />
          <div className="relative">
          <span className="chip bg-white/15 text-white">
            <Bike className="size-3.5" /> Gavyora delivery partners
          </span>
          <h1 className="mt-4 text-3xl leading-tight font-bold sm:text-4xl">Deliver fresh milk. Earn every morning.</h1>
          <p className="mt-3 text-white/80">Join our team of partners bringing farm-fresh dairy to families in your neighbourhood.</p>
          <ul className="mt-8 space-y-5">
            {BENEFITS.map(([Icon, title, text]) => (
              <li key={title} className="flex gap-4">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/15">
                  <Icon className="size-5 text-secondary" />
                </span>
                <span>
                  <span className="block font-semibold">{title}</span>
                  <span className="block text-sm text-white/75">{text}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-8 text-sm text-white/70">
            Already a partner?{' '}
            <Link to="/login?next=/delivery" className="font-semibold text-secondary underline">Log in</Link>
          </p>
          </div>
        </section>

        <section className="card p-5 sm:p-8">
          <ol className="mb-6 flex items-center gap-2">
            {STEPS.map((s, i) => (
              <li key={s} className="flex flex-1 items-center gap-2">
                <span
                  className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                    i < step ? 'bg-primary text-on-primary' : i === step ? 'bg-primary-soft text-brand ring-2 ring-gold' : 'bg-surface-2 text-muted'
                  }`}
                >
                  {i < step ? <Check className="size-4" /> : i + 1}
                </span>
                <span className={`hidden text-xs font-medium sm:block ${i === step ? '' : 'text-muted'}`}>{s}</span>
                {i < STEPS.length - 1 && <span className="h-px flex-1 bg-line" />}
              </li>
            ))}
          </ol>
          <h2 className="mb-4 text-xl font-semibold">{STEPS[step]}</h2>

          <form onSubmit={next} className="space-y-4">
            {step === 0 && (
              <>
                <Field label="Full name (as on Aadhaar)">
                  <input className="input" value={form.name} onChange={set('name')} required minLength={2} autoComplete="name" />
                </Field>
                <Field label="Mobile number" hint="You'll use this to log in">
                  <input className="input" inputMode="numeric" value={form.phone} onChange={set('phone', digits(10))} required pattern="[6-9]\d{9}" title="10-digit Indian mobile number" autoComplete="tel" />
                </Field>
                <Field label="Email (optional)">
                  <input className="input" type="email" value={form.email} onChange={set('email')} autoComplete="email" />
                </Field>
                <Field label="Create password" hint="At least 8 characters">
                  <input className="input" type="password" value={form.password} onChange={set('password')} required minLength={8} autoComplete="new-password" />
                </Field>
              </>
            )}
            {step === 1 && (
              <>
                <Field label="Vehicle" hint="Type and registration number, e.g. Bike MH12 AB 1234">
                  <input className="input" value={form.vehicle} onChange={set('vehicle')} required minLength={2} />
                </Field>
                <Field label="Driving licence number">
                  <input className="input uppercase" value={form.licenseNo} onChange={set('licenseNo')} required minLength={4} />
                </Field>
              </>
            )}
            {step === 2 && (
              <>
                <Field label="Aadhaar: last 4 digits" hint="We only store the last 4 digits">
                  <input className="input" inputMode="numeric" value={form.aadhaarLast4} onChange={set('aadhaarLast4', digits(4))} required pattern="\d{4}" />
                </Field>
                <Field label="Bank account: last 4 digits">
                  <input className="input" inputMode="numeric" value={form.bankAccountLast4} onChange={set('bankAccountLast4', digits(4))} required pattern="\d{4}" />
                </Field>
                <Field label="IFSC code">
                  <input
                    className="input uppercase"
                    value={form.ifsc}
                    onChange={set('ifsc', (v) => v.toUpperCase().slice(0, 11))}
                    required
                    pattern="[A-Za-z]{4}0[A-Za-z0-9]{6}"
                    title="e.g. HDFC0001234"
                  />
                </Field>
                <p className="rounded-xl bg-accent-soft p-3 text-xs text-muted">
                  Uploading photos of your Aadhaar, licence and a cancelled cheque will be added soon. Our team may call you to verify details.
                </p>
              </>
            )}

            <div className="flex gap-3 pt-2">
              {step > 0 && (
                <button type="button" className="btn-outline" onClick={() => setStep(step - 1)}>
                  <ArrowLeft className="size-4" /> Back
                </button>
              )}
              <button className="btn-primary flex-1" disabled={isLoading}>
                {step < STEPS.length - 1 ? (
                  <>
                    Continue <ArrowRight className="size-4" />
                  </>
                ) : isLoading ? (
                  'Submitting…'
                ) : (
                  'Submit application'
                )}
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  )
}
