import { Bell, Languages, LogOut, MonitorSmartphone, Moon, ShieldAlert } from 'lucide-react'
import toast from 'react-hot-toast'
import { useDispatch, useSelector } from 'react-redux'
import { errorMessage, useLogoutAllMutation, useSettingsQuery, useUpdateProfileMutation } from '../../app/api'
import { Toggle } from '../../components/ui'
import { selectUser, setUser } from '../../features/auth/authSlice'
import { useLogout } from '../../hooks/useLogout'
import { useTheme } from '../../hooks/useTheme'

export default function Settings() {
  const user = useSelector(selectUser)
  const dispatch = useDispatch()
  const [theme, toggleTheme] = useTheme()
  const [updateProfile, { isLoading }] = useUpdateProfileMutation()
  const { data: settings } = useSettingsQuery()
  const logout = useLogout()
  const [logoutAll, { isLoading: signingOut }] = useLogoutAllMutation()
  const prefs = user.preferences || { language: 'en', notifications: true }

  const savePrefs = async (patch) => {
    try {
      const res = await updateProfile({ preferences: { ...prefs, ...patch } }).unwrap()
      dispatch(setUser(res.user))
      toast.success('Preferences saved')
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  const supportEmail = settings?.supportEmail || 'care@gavyora.com'

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Settings</h1>

      <div className="card divide-y divide-line">
        <Row icon={Moon} title="Dark mode" text="Easier on the eyes at night.">
          <Toggle checked={theme === 'dark'} onChange={toggleTheme} ariaLabel="Dark mode" />
        </Row>
        <Row icon={Languages} title="Language" text="The website is in English for now. We save your choice for when Hindi is available.">
          <select
            className="input w-auto py-2"
            value={prefs.language}
            disabled={isLoading}
            onChange={(e) => savePrefs({ language: e.target.value })}
            aria-label="Language"
          >
            <option value="en">English</option>
            <option value="hi">हिन्दी</option>
          </select>
        </Row>
        <Row icon={Bell} title="Notifications" text="Order updates, delivery alerts and offers by SMS, email and push.">
          <Toggle checked={!!prefs.notifications} disabled={isLoading} onChange={(v) => savePrefs({ notifications: v })} ariaLabel="Notifications" />
        </Row>
      </div>

      <div className="card divide-y divide-line">
        <Row icon={LogOut} title="Log out" text="Changing your password signs you out on all other devices.">
          <button className="btn-outline btn-sm" onClick={logout}>
            Log out
          </button>
        </Row>
        <Row icon={MonitorSmartphone} title="Sign out of all devices" text="Use this if you lost a phone or logged in on a shared computer.">
          <button
            className="btn-outline btn-sm"
            disabled={signingOut}
            onClick={async () => {
              if (!window.confirm('Sign out of Gavyora on every device, including this one?')) return
              try {
                await logoutAll().unwrap()
              } catch (e) {
                return toast.error(errorMessage(e))
              }
              toast.success('Signed out everywhere')
              logout()
            }}
          >
            Sign out everywhere
          </button>
        </Row>
        <Row icon={ShieldAlert} title="Delete account" text="We'll remove your data within 30 days, as required by law.">
          <a
            className="btn-outline btn-sm border-error text-error hover:border-error hover:text-error"
            href={`mailto:${supportEmail}?subject=${encodeURIComponent('Account deletion request')}&body=${encodeURIComponent(
              `Please delete my Gavyora account.\n\nName: ${user.name}\nPhone: ${user.phone || ''}\nEmail: ${user.email || ''}`,
            )}`}
          >
            Request deletion
          </a>
        </Row>
      </div>
    </div>
  )
}

function Row({ icon: Icon, title, text, children }) {
  return (
    <div className="flex flex-wrap items-center gap-4 p-4 sm:flex-nowrap">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-brand">
        <Icon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium">{title}</p>
        <p className="text-xs text-muted">{text}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}
