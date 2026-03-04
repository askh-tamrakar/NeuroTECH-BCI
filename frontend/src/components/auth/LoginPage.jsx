import React, { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import '../../styles/index.css' // Assuming global styles are here

export default function LoginPage() {
  const { login, signup } = useAuth()
  const { currentTheme } = useTheme()
  const [isSignup, setIsSignup] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState('')

  const pulseStyle = {
    boxShadow: `0 0 20px var(--primary)`,
    animation: 'pulse 2s infinite'
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErrors({})
    setMessage('')
    setLoading(true)

    const newErrors = {}
    if (!email.includes('@')) newErrors.email = 'Invalid email'
    if (password.length < 4) newErrors.password = 'Password too short'
    if (isSignup && !name) newErrors.name = 'Name is required'

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      setLoading(false)
      return
    }

    try {
      if (isSignup) {
        const result = await signup(email, password, name)
        if (result.success) {
          setMessage('Account created! Please sign in.')
          setIsSignup(false)
        } else {
          setErrors({ form: result.message })
        }
      } else {
        const result = await login(email, password)
        if (!result.success) {
          setErrors({ form: result.message })
        }
      }
    } catch (err) {
      setErrors({ form: 'An unexpected error occurred' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{ background: 'var(--bg)', color: 'var(--text)' }}>

      {/* Dynamic Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full blur-[120px]"
          style={{ background: 'rgba(var(--primary-rgb), 0.1)' }}></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full blur-[120px]"
          style={{ background: 'rgba(var(--accent-rgb), 0.1)' }}></div>
      </div>

      {/* Main Glass Card */}
      <div className="relative z-10 w-full max-w-md backdrop-blur-xl bg-opacity-10 rounded-3xl p-8 border border-opacity-20 transition-all duration-500"
        style={{
          backgroundColor: 'rgba(var(--surface-rgb), 0.6)',
          borderColor: 'var(--primary)',
          boxShadow: `0 8px 32px 0 rgba(0, 0, 0, 0.8), 0 0 15px var(--primary)`
        }}>

        <div className="text-center mb-8">
          <div className="inline-block p-4 rounded-full mb-4 relative" style={{ background: 'rgba(var(--primary-rgb), 0.1)' }}>
            <span className="text-5xl" style={{ filter: `drop-shadow(0 0 10px var(--primary))` }}>🧠</span>
            <div className="absolute inset-0 rounded-full border border-primary animate-ping opacity-20"></div>
          </div>
          <h1 className="text-4xl font-black tracking-tighter mb-1" style={{ color: 'var(--primary)', textShadow: '0 0 10px var(--primary)' }}>
            NEUROTECH
          </h1>
          <p className="text-sm uppercase tracking-widest opacity-60">Neural Interface Core</p>
        </div>

        {message && (
          <div className="mb-6 p-3 rounded-lg text-center text-sm font-semibold"
            style={{ background: 'rgba(var(--text-success-rgb), 0.2)', border: '1px solid var(--text-success)', color: 'var(--text-success)' }}>
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {isSignup && (
            <div className="group relative">
              <label className="block text-xs font-bold uppercase tracking-widest mb-1 opacity-70 ml-1">Full Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-black bg-opacity-30 border border-opacity-20 rounded-xl px-4 py-3 outline-none focus:border-opacity-100 transition-all text-sm"
                style={{ borderColor: 'var(--primary)' }}
                placeholder="John Doe"
              />
              {errors.name && <p className="text-red-500 text-[10px] mt-1 uppercase font-bold tracking-tighter">{errors.name}</p>}
            </div>
          )}

          <div className="group relative">
            <label className="block text-xs font-bold uppercase tracking-widest mb-1 opacity-70 ml-1">Neural ID (Email)</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-black bg-opacity-30 border border-opacity-20 rounded-xl px-4 py-3 outline-none focus:border-opacity-100 transition-all text-sm"
              style={{ borderColor: 'var(--primary)' }}
              placeholder="operator@neuro.sys"
            />
            {errors.email && <p className="text-red-500 text-[10px] mt-1 uppercase font-bold tracking-tighter">{errors.email}</p>}
          </div>

          <div className="group relative">
            <label className="block text-xs font-bold uppercase tracking-widest mb-1 opacity-70 ml-1">Access Key</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-black bg-opacity-30 border border-opacity-20 rounded-xl px-4 py-3 outline-none focus:border-opacity-100 transition-all text-sm"
              style={{ borderColor: 'var(--primary)' }}
              placeholder="••••••••"
            />
            {errors.password && <p className="text-red-500 text-[10px] mt-1 uppercase font-bold tracking-tighter">{errors.password}</p>}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 rounded-xl font-bold uppercase tracking-widest transition-all duration-300 relative group overflow-hidden"
            style={{
              background: loading ? 'var(--muted)' : 'var(--primary)',
              color: 'var(--bg)',
              boxShadow: !loading ? '0 0 20px var(--primary)' : 'none'
            }}
          >
            <span className="relative z-10">{loading ? 'Processing...' : (isSignup ? 'Initialize Account' : 'Establish Link')}</span>
            <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-20 transition-opacity"></div>
          </button>

          {errors.form && (
            <p className="text-red-500 text-xs text-center font-bold uppercase tracking-tight">
              {errors.form}
            </p>
          )}
        </form>

        <div className="mt-8 pt-6 border-t border-opacity-10 text-center" style={{ borderColor: 'var(--primary)' }}>
          <button
            onClick={() => {
              setIsSignup(!isSignup)
              setErrors({})
            }}
            className="text-xs uppercase font-black tracking-[0.2em] transition-all hover:opacity-100 opacity-60"
            style={{ color: 'var(--accent)' }}
          >
            {isSignup ? 'Back to Terminal' : 'Request New Neural ID'}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0% { box-shadow: 0 0 0 0 rgba(var(--primary-rgb), 0.7); }
          70% { box-shadow: 0 0 0 10px rgba(var(--primary-rgb), 0); }
          100% { box-shadow: 0 0 0 0 rgba(var(--primary-rgb), 0); }
        }
      `}</style>
    </div>
  )
}
