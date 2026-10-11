import { ChevronDown, Eye, EyeOff, Smartphone } from 'lucide-react'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useDispatch } from 'react-redux'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { errorMessage, useLoginMutation, useSendOtpMutation, useVerifyOtpMutation } from '../../app/api'
import { Field, Tabs } from '../../components/ui'
import { homeForRole, setUser } from '../../features/auth/authSlice'
import { safeNext } from '../../components/guards'
import AuthShell from './AuthShell'

// Demo accounts exist only in the development database, so they are compiled out of production builds.
const DEMO = import.meta.env.DEV
  ? [
      ['Customer', 'customer@gavyora.com', 'Customer@123'],
      ['Delivery partner', 'rider@gavyora.com', 'Delivery@123'],
      ['Admin', 'admin@gavyora.com', 'Admin@123'],
      ['Super admin', 'owner@gavyora.com', 'Gavyora@123'],
    ]
  : []

export default function Login() {
  const [params] = useSearchParams()
  const [mode, setMode] = useState(params.get('mode') === 'password' ? 'password' : 'otp')
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const next = safeNext(params.get('next'), '') || null

  const done = (res) => {
    dispatch(setUser(res.user))
    toast.success(`Welcome, ${res.user.name.split(' ')[0]}!`)
    navigate(next || homeForRole(res.user.role), { replace: true })
  }

  const [demoFill, setDemoFill] = useState(null)

  return (
    <AuthShell title="Login or sign up" subtitle="Fresh dairy is just a few taps away.">
      <Tabs
        tabs={[
          { value: 'otp', label: 'Mobile OTP' },
          { value: 'password', label: 'Email / password' },
        ]}
        value={mode}
        onChange={setMode}
      />
      <div className="mt-5">{mode === 'otp' ? <OtpForm onDone={done} /> : <PasswordForm key={demoFill?.t} onDone={done} fill={demoFill} />}</div>

      <div className="mt-6 space-y-1 text-center text-sm">
        <p>
          New to Gavyora?{' '}
          <Link to={`/register${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="link">
            Create an account
          </Link>
        </p>
        <p>
          Want to deliver with us?{' '}
          <Link to="/delivery/register" className="link">
            Become a delivery partner
          </Link>
        </p>
      </div>

      {DEMO.length > 0 && (
        <details className="mt-6 rounded-xl border border-dashed border-line bg-surface-2 p-3 text-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between font-medium">
            Demo accounts <ChevronDown className="size-4" />
          </summary>
          <ul className="mt-3 space-y-2">
            {DEMO.map(([role, email, password]) => (
              <li key={email} className="flex items-center justify-between gap-2">
                <span className="min-w-0">
                  <b className="block text-xs">{role}</b>
                  <span className="block truncate text-xs text-muted">
                    {email} / {password}
                  </span>
                </span>
                <button
                  type="button"
                  className="btn-outline btn-sm shrink-0"
                  onClick={() => {
                    setMode('password')
                    setDemoFill({ identifier: email, password, t: Date.now() })
                  }}
                >
                  Use
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </AuthShell>
  )
}

function PasswordForm({ onDone, fill }) {
  const [login, { isLoading }] = useLoginMutation()
  const [form, setForm] = useState({ identifier: fill?.identifier || '', password: fill?.password || '' })
  const [show, setShow] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    try {
      onDone(await login(form).unwrap())
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Email or mobile number">
        <input
          className="input"
          required
          autoComplete="username"
          value={form.identifier}
          onChange={(e) => setForm({ ...form, identifier: e.target.value })}
        />
      </Field>
      <Field label="Password">
        <div className="relative">
          <input
            className="input pr-11"
            required
            type={show ? 'text' : 'password'}
            autoComplete="current-password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <button
            type="button"
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg p-1.5 text-muted hover:bg-surface-2"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? 'Hide password' : 'Show password'}
          >
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </Field>
      <div className="text-right">
        <Link to="/forgot-password" className="link text-sm">
          Forgot password?
        </Link>
      </div>
      <button className="btn-primary w-full" disabled={isLoading}>
        {isLoading ? 'Logging in…' : 'Login'}
      </button>
    </form>
  )
}

function OtpForm({ onDone }) {
  const [sendOtp, { isLoading: sending }] = useSendOtpMutation()
  const [verifyOtp, { isLoading: verifying }] = useVerifyOtpMutation()
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [name, setName] = useState('')
  const [step, setStep] = useState('phone')
  const [isNew, setIsNew] = useState(false)
  const [devOtp, setDevOtp] = useState('')
  const [countdown, setCountdown] = useState(0)

  useEffect(() => {
    if (countdown <= 0) return
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown])

  const send = async (e) => {
    e?.preventDefault()
    if (!/^[6-9]\d{9}$/.test(phone)) return toast.error('Enter a valid 10-digit mobile number')
    try {
      const res = await sendOtp({ phone }).unwrap()
      setIsNew(res.isNew)
      setDevOtp(res.devOtp || '')
      if (res.devOtp) setOtp(res.devOtp)
      setStep('otp')
      setCountdown(30)
      toast.success('OTP sent to your phone')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const verify = async (e) => {
    e.preventDefault()
    if (isNew && name.trim().length < 2) return toast.error('Please enter your name')
    try {
      onDone(await verifyOtp({ phone, otp, ...(isNew ? { name: name.trim() } : {}) }).unwrap())
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  if (step === 'phone') {
    return (
      <form onSubmit={send} className="space-y-4">
        <Field label="Mobile number" hint="We'll send a 6-digit code by SMS.">
          <div className="flex">
            <span className="flex items-center rounded-l-xl border border-r-0 border-line bg-surface-2 px-3 text-sm text-muted">+91</span>
            <input
              className="input rounded-l-none"
              inputMode="numeric"
              autoComplete="tel-national"
              maxLength={10}
              required
              placeholder="98765 43210"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
              autoFocus
            />
          </div>
        </Field>
        <button className="btn-primary w-full" disabled={sending || phone.length !== 10}>
          <Smartphone className="size-4" /> {sending ? 'Sending…' : 'Get OTP'}
        </button>
      </form>
    )
  }

  return (
    <form onSubmit={verify} className="space-y-4">
      <p className="text-sm">
        Enter the code sent to <b>+91 {phone}</b>{' '}
        <button
          type="button"
          className="link text-sm"
          onClick={() => {
            setStep('phone')
            setOtp('')
          }}
        >
          Change
        </button>
      </p>
      {devOtp && (
        <p className="rounded-lg bg-secondary-soft px-3 py-2 text-xs">
          Dev mode OTP: <b className="tracking-widest">{devOtp}</b> (auto-filled)
        </p>
      )}
      <Field label="6-digit OTP">
        <input
          className="input text-center font-heading text-xl tracking-[0.5em]"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          required
          value={otp}
          onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
          autoFocus
        />
      </Field>
      {isNew && (
        <Field label="Your name" hint="Looks like you're new here. Welcome!">
          <input className="input" required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
      )}
      <button className="btn-primary w-full" disabled={verifying || otp.length !== 6}>
        {verifying ? 'Verifying…' : isNew ? 'Create account' : 'Verify & login'}
      </button>
      <p className="text-center text-sm text-muted">
        {countdown > 0 ? (
          `Resend OTP in ${countdown}s`
        ) : (
          <button type="button" className="link" onClick={send} disabled={sending}>
            Resend OTP
          </button>
        )}
      </p>
    </form>
  )
}
