import { MailCheck } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { Link } from 'react-router-dom'
import { errorMessage, useForgotPasswordMutation } from '../../app/api'
import { Field } from '../../components/ui'
import AuthShell from './AuthShell'

export default function ForgotPassword() {
  const [forgot, { isLoading }] = useForgotPasswordMutation()
  const [email, setEmail] = useState('')
  const [result, setResult] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    try {
      setResult(await forgot({ email: email.trim() }).unwrap())
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <AuthShell title="Forgot your password?" subtitle="Enter your email and we'll send you a link to reset it.">
      {result ? (
        <div className="space-y-4 text-center">
          <MailCheck className="mx-auto size-12 text-brand" />
          <p className="text-sm">{result.message}</p>
          {result.devResetLink && (
            <p className="rounded-lg bg-secondary-soft p-3 text-left text-xs break-all">
              Dev mode: no email is sent yet.{' '}
              <a href={result.devResetLink} className="link">
                Open the reset link
              </a>
            </p>
          )}
          <Link to="/login" className="btn-outline w-full">
            Back to login
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="Email">
            <input className="input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <button className="btn-primary w-full" disabled={isLoading}>
            {isLoading ? 'Sending…' : 'Send reset link'}
          </button>
          <p className="text-center text-sm">
            Remembered it?{' '}
            <Link to="/login" className="link">
              Log in
            </Link>{' '}
            · Signed up with mobile?{' '}
            <Link to="/login?mode=otp" className="link">
              Use OTP
            </Link>
          </p>
        </form>
      )}
    </AuthShell>
  )
}
