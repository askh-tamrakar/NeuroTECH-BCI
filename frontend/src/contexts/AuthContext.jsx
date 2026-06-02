import React, { createContext, useState, useEffect, useContext } from 'react'

const AuthContext = createContext(null)

// Remote PHP bridge
const REMOTE_AUTH_URL = 'https://neurotech.withaspire.in/auth.php'

// Local Flask backend — same origin as the app when served through the Python server
const LOCAL_AUTH_BASE = `${window.location.protocol}//${window.location.hostname}:5000/api/auth`

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [isLocalAuth, setIsLocalAuth] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('bci_token')
    const userData = localStorage.getItem('bci_user')
    const localFlag = localStorage.getItem('bci_auth_local') === '1'
    if (token && userData) {
      setUser(JSON.parse(userData))
      setIsLocalAuth(localFlag)
    }
    setLoading(false)
  }, [])

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  const _persistSession = (token, userObj, local) => {
    localStorage.setItem('bci_token', token)
    localStorage.setItem('bci_user', JSON.stringify(userObj))
    if (local) {
      localStorage.setItem('bci_auth_local', '1')
    } else {
      localStorage.removeItem('bci_auth_local')
    }
    setUser(userObj)
    setIsLocalAuth(local)
  }

  // -------------------------------------------------------------------------
  // signup
  // -------------------------------------------------------------------------

  const signup = async (email, password, name, username, profileImage = null) => {
    const payload = { email, password, name, username }
    if (profileImage) payload.profile_image = profileImage

    // Try remote first
    try {
      const res = await fetch(`${REMOTE_AUTH_URL}?action=signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (data.status === 'success') return { success: true, email }
      if (data.status === 'partial_success') return { success: true, email, partial: true, debug: data.debug }
      if (data.status === 'unverified_exists') return { success: false, status: data.status, email: data.email, message: data.message }
      return { success: false, message: data.message }
    } catch {
      // Network error — fall back to local
    }

    try {
      const res = await fetch(`${LOCAL_AUTH_BASE}/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (data.status === 'success') {
        return { success: true, email, local: true, skipOtp: true }
      }
      return { success: false, message: data.message }
    } catch {
      return { success: false, message: 'No connection to authentication servers. Make sure the local backend is running.' }
    }
  }

  // -------------------------------------------------------------------------
  // verifyOtp / resendOtp  (remote-only — local accounts skip OTP)
  // -------------------------------------------------------------------------

  const verifyOtp = async (email, otp) => {
    try {
      const res = await fetch(`${REMOTE_AUTH_URL}?action=verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp }),
      })
      const data = await res.json()
      if (data.status === 'success') return { success: true, message: data.message }
      return { success: false, message: data.message }
    } catch (err) {
      console.error('OTP verification error:', err)
      return { success: false, message: 'Verification failed — no connection to remote server' }
    }
  }

  const resendOtp = async (email) => {
    try {
      const res = await fetch(`${REMOTE_AUTH_URL}?action=resend-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      return { success: data.status === 'success', message: data.message, debug: data.debug }
    } catch {
      return { success: false, message: 'Failed to resend — no connection to remote server' }
    }
  }

  // -------------------------------------------------------------------------
  // login
  // -------------------------------------------------------------------------

  const login = async (username, password) => {
    let remoteError = null

    // Try remote first
    try {
      const res = await fetch(`${REMOTE_AUTH_URL}?action=login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json()
      if (data.status === 'success') {
        _persistSession(data.token, data.user, false)
        return { success: true }
      }
      if (data.status === 'unverified_exists') {
        return { success: false, status: data.status, email: data.email, message: data.message }
      }
      // Remote reachable but rejected — store the error, still try local
      // (user may only exist locally, e.g. created during server downtime)
      remoteError = data.message
    } catch {
      // Network error — fall through to local
    }

    // Try local (runs on remote network error OR remote "invalid credentials")
    try {
      const res = await fetch(`${LOCAL_AUTH_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json()
      if (data.status === 'success') {
        _persistSession(data.token, data.user, true)
        return { success: true, local: true }
      }
      // Both failed — show remote error if remote was reachable, otherwise local error
      return { success: false, message: remoteError || data.message }
    } catch {
      return { success: false, message: remoteError || 'No connection to authentication servers. Make sure the local backend is running.' }
    }
  }

  // -------------------------------------------------------------------------
  // logout
  // -------------------------------------------------------------------------

  const logout = () => {
    localStorage.removeItem('bci_token')
    localStorage.removeItem('bci_user')
    localStorage.removeItem('bci_auth_local')
    setUser(null)
    setIsLocalAuth(false)
  }

  // -------------------------------------------------------------------------
  // Admin: sync local users to remote server
  // -------------------------------------------------------------------------

  const syncToServer = async () => {
    const token = localStorage.getItem('bci_token')
    try {
      const res = await fetch(`${LOCAL_AUTH_BASE}/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      })
      const data = await res.json()
      return data
    } catch (err) {
      return { status: 'error', message: `Sync failed: ${err.message}` }
    }
  }

  // -------------------------------------------------------------------------
  // Dev bypass — skip auth in dev mode
  // -------------------------------------------------------------------------

  const devBypass = () => {
    const devUser = {
      id: 'dev-bypass-user',
      username: 'dev_admin',
      name: 'Dev Admin',
      email: 'dev@neuro.tech',
      is_admin: true,
    }
    _persistSession('dev-bypass-token', devUser, true)
  }

  const isAdmin = Boolean(user?.is_admin)

  return (
    <AuthContext.Provider value={{ user, loading, isLocalAuth, isAdmin, login, logout, signup, verifyOtp, resendOtp, syncToServer, devBypass }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}

