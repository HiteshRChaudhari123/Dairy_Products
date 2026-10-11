import { useDispatch } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { api, useLogoutMutation } from '../app/api'
import { signedOut } from '../features/auth/authSlice'

export function useLogout() {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const [logout] = useLogoutMutation()
  return async () => {
    try {
      await logout().unwrap()
    } catch {
      /* ignore network errors on logout */
    }
    dispatch(signedOut())
    dispatch(api.util.resetApiState())
    navigate('/', { replace: true })
  }
}
