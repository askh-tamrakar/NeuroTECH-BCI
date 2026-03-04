import React, { createContext, useState, useEffect, useContext } from 'react'

const AuthContext = createContext(null)

<<<<<<< HEAD
=======
// PHP Bridge URL - Updated to the provided working host
const API_BASE_URL = 'https://aksh.tamrakar.withaspire.in/public/auth.php'

>>>>>>> extra-features
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

<<<<<<< HEAD
  const login = async (email, password) => {
    const mockUser = { email, name: email.split('@')[0], avatar: '👤' }
    const mockToken = 'mock_jwt_token_' + Date.now()
    localStorage.setItem('bci_token', mockToken)
    localStorage.setItem('bci_user', JSON.stringify(mockUser))
    setUser(mockUser)
    return Promise.resolve(mockUser)
=======
  const signup = async (email, password, name) => {
    try {
      const res = await fetch(`${API_BASE_URL}?action=signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name })
      })
      const data = await res.json()
      if (data.status === 'success') {
        return { success: true }
      } else {
        return { success: false, message: data.message }
      }
    } catch (err) {
      console.error('Signup error:', err)
      return { success: false, message: 'Connection to auth server failed' }
    }
  }

  const login = async (email, password) => {
    try {
      const res = await fetch(`${API_BASE_URL}?action=login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
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
>>>>>>> extra-features
  }

  const logout = () => {
    localStorage.removeItem('bci_token')
    localStorage.removeItem('bci_user')
    setUser(null)
  }

  return (
<<<<<<< HEAD
    <AuthContext.Provider value={{ user, loading, login, logout }}>
=======
    <AuthContext.Provider value={{ user, loading, login, logout, signup }}>
>>>>>>> extra-features
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
