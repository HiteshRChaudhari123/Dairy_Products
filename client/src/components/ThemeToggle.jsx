import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../hooks/useTheme'

/** Sun/moon button that switches light and dark mode and remembers the choice. */
export default function ThemeToggle({ className = '', ...rest }) {
  const [theme, toggleTheme] = useTheme()
  const dark = theme === 'dark'
  return (
    <button
      {...rest}
      onClick={toggleTheme}
      className={`icon-btn ${className}`}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Light mode' : 'Dark mode'}
    >
      {dark ? <Sun className="size-5" strokeWidth={1.5} /> : <Moon className="size-5" strokeWidth={1.5} />}
    </button>
  )
}
