import React, { createContext, useState, useEffect, useContext } from 'react'

const AuthContext = createContext(null)

// PHP Bridge URL - Updated to the provided working host
const API_BASE_URL = 'https://neurotech.withaspire.in/auth.php'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('bci_token')
    const userData = localStorage.getItem('bci_user')
    if (token && userData) {
      setUser(JSON.parse(userData))
    }
    setLoading(false)
  }, [])

  const signup = async (email, password, name, username) => {
    try {
      const res = await fetch(`${API_BASE_URL}?action=signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name, username })
      })
      const data = await res.json()
      if (data.status === 'success') {
        return { success: true, email }
      } else if (data.status === 'partial_success') {
        return { success: true, email, partial: true, debug: data.debug }
      } else {
        return { success: false, message: data.message }
      }
    } catch (err) {
      console.error('Signup error:', err)
      return { success: false, message: 'Connection to auth server failed' }
    }
  }

  const verifyOtp = async (email, otp) => {
    try {
      const res = await fetch(`${API_BASE_URL}?action=verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp })
      })
      const data = await res.json()
      if (data.status === 'success') {
        return { success: true, message: data.message }
      } else {
        return { success: false, message: data.message }
      }
    } catch (err) {
      console.error('OTP verification error:', err)
      return { success: false, message: 'Verification failed' }
    }
  }

  const resendOtp = async (email) => {
    try {
      const res = await fetch(`${API_BASE_URL}?action=resend-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      })
      const data = await res.json()
      return { success: data.status === 'success', message: data.message, debug: data.debug }
    } catch (err) {
      return { success: false, message: 'Failed to resend' }
    }
  }

  const login = async (username, password) => {
    try {
      const res = await fetch(`${API_BASE_URL}?action=login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      })
      const data = await res.json()
      if (data.status === 'success') {
        localStorage.setItem('bci_token', data.token)
        localStorage.setItem('bci_user', JSON.stringify(data.user))
        setUser(data.user)
        return { success: true }
      } else {
        return { success: false, message: data.message }
      }
    } catch (err) {
      console.error('Login error:', err)
      return { success: false, message: 'Connection to auth server failed' }
    }
  }

  const logout = () => {
    localStorage.removeItem('bci_token')
    localStorage.removeItem('bci_user')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, signup, verifyOtp, resendOtp }}>
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
