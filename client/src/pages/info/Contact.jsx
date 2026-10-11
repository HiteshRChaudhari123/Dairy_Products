import { BadgeCheck, Clock, ExternalLink, Mail, MapPin, Phone } from 'lucide-react'
import { useState } from 'react'
import { useSettingsQuery } from '../../app/api'
import PageHero from '../../components/PageHero'
import { Field } from '../../components/ui'
import { telHref } from '../../lib/format'
import { PHOTOS } from '../../lib/images'

export default function Contact() {
  const { data: s } = useSettingsQuery()
  const [form, setForm] = useState({ name: '', email: '', message: '' })
  const email = s?.supportEmail
  const phone = s?.supportPhone

  const submit = (e) => {
    e.preventDefault()
    const body = `${form.message}\n\n— ${form.name} (${form.email})`
    window.location.href = `mailto:${email}?subject=${encodeURIComponent(`Enquiry from ${form.name}`)}&body=${encodeURIComponent(body)}`
  }

  // Only details the owner has actually set in Global settings are shown.
  const details = [
    phone && [Phone, 'Phone', <a key="p" href={telHref(phone)} className="link">{phone}</a>],
    email && [Mail, 'Email', <a key="e" href={`mailto:${email}`} className="link break-all">{email}</a>],
    s?.address && [
      MapPin,
      'Address',
      <a key="a" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.address)}`} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1">
        {s.address} <ExternalLink className="size-3.5 shrink-0" aria-label="(opens Google Maps)" />
      </a>,
    ],
    [Clock, 'Hours', 'Customer care: 6:00 AM – 10:00 PM, all days'],
    [BadgeCheck, 'Licences', `FSSAI: ${s?.fssaiNo || 'applied for'} · GSTIN: ${s?.gstNo || 'applied for'}`],
  ].filter(Boolean)

  return (
    <div className="container-page py-5 sm:py-8">
      <PageHero
        image={PHOTOS.contact}
        eyebrow="Get in touch"
        title="Contact us"
        subtitle="We'd love to hear from you, whether it's feedback, a bulk order or a partnership. Our care team is here 6 AM to 10 PM, every day."
        crumbs={[['Home', '/'], ['Contact']]}
        actions={
          (phone || email) && (
            <>
              {phone && (
                <a href={telHref(phone)} className="btn-primary">
                  <Phone className="size-4" /> Call {phone}
                </a>
              )}
              {email && (
                <a href={`mailto:${email}`} className={phone ? 'btn-outline bg-surface/40 backdrop-blur-sm' : 'btn-primary'}>
                  <Mail className="size-4" /> Email us
                </a>
              )}
            </>
          )
        }
      />

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <ul className="card h-fit divide-y divide-line">
          {details.map(([Icon, label, value]) => (
            <li key={label} className="flex items-start gap-3 p-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-brand">
                <Icon className="size-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted uppercase">{label}</p>
                <div className="text-sm break-words">{value}</div>
              </div>
            </li>
          ))}
        </ul>

        {email ? (
          <form onSubmit={submit} className="card space-y-4 p-6">
            <h2 className="text-lg font-semibold">Send us a message</h2>
            <Field label="Your name">
              <input className="input" required autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Email">
              <input className="input" type="email" required autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="Message">
              <textarea className="input min-h-36" required value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
            </Field>
            <button className="btn-primary w-full">
              <Mail className="size-4" /> Write the email
            </button>
            <p className="text-xs text-muted">This opens your email app with your message ready to send to {email}.</p>
          </form>
        ) : (
          <div className="card p-6 text-sm text-muted">Our contact details will appear here soon. Meanwhile, you can reach us through the help centre.</div>
        )}
      </div>
    </div>
  )
}
