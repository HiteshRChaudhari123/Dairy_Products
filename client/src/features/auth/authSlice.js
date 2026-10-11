import { createSlice } from '@reduxjs/toolkit'

// status: 'loading' until the first /auth/me check finishes, then 'ready'.
// signedOut: the user pressed Logout (as opposed to a session expiring), so guards send them home, not to /login.
const authSlice = createSlice({
  name: 'auth',
  initialState: { user: null, status: 'loading', signedOut: false },
  reducers: {
    setUser(state, { payload }) {
      state.user = payload
      state.status = 'ready'
      state.signedOut = false
    },
    loggedOut(state) {
      state.user = null
      state.status = 'ready'
    },
    signedOut(state) {
      state.user = null
      state.status = 'ready'
      state.signedOut = true
    },
  },
})

export const { setUser, loggedOut, signedOut } = authSlice.actions
export default authSlice.reducer

export const selectUser = (s) => s.auth.user
export const selectAuthReady = (s) => s.auth.status === 'ready'
export const selectSignedOut = (s) => s.auth.signedOut

/** Where each role lands after logging in. */
export const homeForRole = (role) =>
  ({ superadmin: '/superadmin', admin: '/admin', delivery: '/delivery' })[role] || '/'
