import React, { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import '../../styles/index.css' // Assuming global styles are here

export default function LoginPage() {
  const { login, signup, verifyOtp, resendOtp } = useAuth()
  const { currentTheme } = useTheme()
  const [isSignup, setIsSignup] = useState(false)
  const [showOtp, setShowOtp] = useState(false)
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [otp, setOtp] = useState('')
  const [timeLeft, setTimeLeft] = useState(900) // 15 minutes
  const [resendLoading, setResendLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState('')

  useEffect(() => {
    let timer
    if (showOtp && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft(prev => prev - 1)
      }, 1000)
    }
    return () => clearInterval(timer)
  }, [showOtp, timeLeft])

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const handleResend = async () => {
    setResendLoading(true)
    const result = await resendOtp(email)
    if (result.success) {
      setMessage('New access vector transmitted.')
      setTimeLeft(900)
    } else {
      setErrors({ form: result.message })
    }
    setResendLoading(false)
  }

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
    if (isSignup && !email.includes('@')) newErrors.email = 'Invalid email'
    if (isSignup && !username) newErrors.username = 'Username required'
    if (!isSignup && !username) newErrors.username = 'Username required'
    if (password.length < 4) newErrors.password = 'Access Key too short'
    if (isSignup && !name) newErrors.name = 'Full Name is required'

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      setLoading(false)
      return
    }

    try {
      if (showOtp) {
        const result = await verifyOtp(email, otp)
        if (result.success) {
          setMessage(result.message)
          setShowOtp(false)
          setIsSignup(false)
          setOtp('')
        } else {
          setErrors({ form: result.message })
        }
      } else if (isSignup) {
        const result = await signup(email, password, name, username)
        if (result.success) {
          setMessage(`Neural account initiated. check ${email} for access vector.`)
          setShowOtp(true)
          setTimeLeft(900)
        } else {
          setErrors({ form: result.message })
        }
      } else {
        const result = await login(username, password)
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
          {showOtp ? (
            <div className="group relative space-y-4">
              <label className="block text-xs font-bold uppercase tracking-widest mb-1 opacity-70 ml-1 text-center">
                Access Vector (OTP) - Expiring in {formatTime(timeLeft)}
              </label>
              <input
                type="text"
                maxLength="4"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ''))}
                className="w-full bg-black bg-opacity-30 border border-opacity-20 rounded-xl px-4 py-3 outline-none focus:border-opacity-100 transition-all text-center text-2xl tracking-[12px] font-mono"
                style={{ borderColor: timeLeft < 60 ? '#ff4d4d' : 'var(--primary)' }}
                placeholder="0000"
              />
              <div className="text-center">
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendLoading || timeLeft > 840}
                  className="text-[10px] uppercase font-bold tracking-widest opacity-60 hover:opacity-100 transition-all"
                  style={{ color: 'var(--accent)' }}
                >
                  {resendLoading ? 'Re-transmitting...' : (timeLeft > 840 ? `Wait ${timeLeft - 840}s` : 'Request New Sync Vector')}
                </button>
              </div>
              {errors.otp && <p className="text-red-500 text-[10px] mt-1 uppercase font-bold tracking-tighter text-center">{errors.otp}</p>}
            </div>
          ) : (
            <>
              <div className="group relative">
                <label className="block text-xs font-bold uppercase tracking-widest mb-1 opacity-70 ml-1">Neural Identity (Username)</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-black bg-opacity-30 border border-opacity-20 rounded-xl px-4 py-3 outline-none focus:border-opacity-100 transition-all text-sm"
                  style={{ borderColor: 'var(--primary)' }}
                  placeholder="neuro_operator_01"
                />
                {errors.username && <p className="text-red-500 text-[10px] mt-1 uppercase font-bold tracking-tighter">{errors.username}</p>}
              </div>

              {isSignup && (
                <>
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

                  <div className="group relative">
                    <label className="block text-xs font-bold uppercase tracking-widest mb-1 opacity-70 ml-1">Transmission Channel (Email)</label>
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
                </>
              )}

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
            </>
          )}

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
            <span className="relative z-10">
              {loading ? 'Processing...' : (showOtp ? 'Synchronize Consciousness' : (isSignup ? 'Initialize Account' : 'Establish Link'))}
            </span>
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
              setShowOtp(false)
              setMessage('')
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
