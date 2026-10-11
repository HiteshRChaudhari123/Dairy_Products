import { CheckCircle2, MapPin, XCircle } from 'lucide-react'
import { useState } from 'react'
import { useLazyServiceabilityQuery } from '../app/api'
import { loadList, save } from '../lib/storage'
import { Modal } from './ui'

export const getPincode = () => loadList('gv_pincode')[0] || ''

export function usePincodeCheck() {
  const [check, { data, isFetching, error }] = useLazyServiceabilityQuery()
  return { check, result: data, isFetching, error }
}

/** Check whether we deliver to a pincode, and remember it for the header. */
export default function PincodeModal({ open, onClose, onSaved }) {
  const [pin, setPin] = useState(getPincode())
  const { check, result, isFetching } = usePincodeCheck()

  const submit = async (e) => {
    e.preventDefault()
    if (!/^\d{6}$/.test(pin)) return
    const r = await check(pin).unwrap().catch(() => null)
    if (r?.serviceable) {
      save('gv_pincode', [pin])
      onSaved?.(pin)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Choose your delivery location" size="max-w-md">
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm text-muted">Enter your pincode to see if we deliver fresh milk to your area.</p>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <MapPin className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <input
              className="input pl-9"
              inputMode="numeric"
              maxLength={6}
              placeholder="e.g. 411001"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              autoFocus
            />
          </div>
          <button className="btn-primary" disabled={pin.length !== 6 || isFetching}>
            Check
          </button>
        </div>
        {result &&
          (result.serviceable ? (
            <p className="flex items-center gap-2 rounded-xl bg-primary-soft p-3 text-sm text-brand">
              <CheckCircle2 className="size-5" /> Great news! We deliver to {pin}
              {result.zone?.name ? ` (${result.zone.name} zone)` : ''}.
            </p>
          ) : (
            <p className="flex items-center gap-2 rounded-xl bg-error/10 p-3 text-sm text-error ">
              <XCircle className="size-5" /> Sorry, we don't deliver to {pin} yet. We're expanding soon!
            </p>
          ))}
        {import.meta.env.DEV && <p className="text-xs text-muted">Demo pincodes (development): 411001, 411002, 411014, 411038</p>}
      </form>
    </Modal>
  )
}
