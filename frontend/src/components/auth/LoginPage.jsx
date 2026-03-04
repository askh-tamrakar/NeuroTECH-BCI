import React, { useState, useEffect, useRef } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { motion, AnimatePresence } from 'framer-motion'
import { Camera, Mail, User, Lock, Upload, ArrowRight, BrainCircuit, RefreshCw, AlertCircle, CheckCircle2, Eye, EyeOff } from 'lucide-react'
import '../../styles/index.css'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.5, staggerChildren: 0.1 }
  },
  exit: { opacity: 0, transition: { duration: 0.3 } }
}

const itemVariants = {
  hidden: { opacity: 0, y: 15 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } }
}

const InputField = ({ icon: Icon, type, placeholder, value, onChange, error, label, className = "" }) => {
  const [showPassword, setShowPassword] = useState(false);
  const isPasswordField = type === 'password';
  const inputType = isPasswordField ? (showPassword ? 'text' : 'password') : type;

  return (
    <motion.div variants={itemVariants} className={`group relative w-full mb-5 ${className}`}>
      <label className="block text-[11px] font-bold uppercase tracking-[0.2em] mb-2 opacity-70 ml-1 text-white">{label}</label>
      <div className="relative flex items-center">
        <div className="absolute left-4 opacity-50 text-[var(--primary)] group-focus-within:opacity-100 transition-opacity">
          <Icon size={18} />
        </div>
        <input
          type={inputType}
          value={value}
          onChange={onChange}
          className={`w-full bg-black/40 backdrop-blur-md border border-white/10 focus:border-[var(--primary)] rounded-xl pl-12 ${isPasswordField ? 'pr-12' : 'pr-4'} py-4 outline-none transition-all text-base `}
          style={{
            boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.5)',
            color: 'white'
          }}
          placeholder={placeholder}
        />

        {isPasswordField && (
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-4 text-white/40 hover:text-[var(--primary)] transition-colors focus:outline-none"
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        )}

        <div className="absolute inset-0 -z-10 rounded-xl bg-gradient-to-r from-[var(--primary)] to-[var(--accent)] opacity-0 group-focus-within:opacity-20 blur-md transition-opacity duration-500"></div>
      </div>
      {error && <p className="text-red-400 text-[10px] mt-1.5 uppercase font-bold tracking-tighter absolute -bottom-5 right-1">{error}</p>}
    </motion.div>
  );
}

export default function LoginPage() {
  const { login, signup, verifyOtp, resendOtp } = useAuth()

  const [isSignup, setIsSignup] = useState(false)
  const [showOtp, setShowOtp] = useState(false)

  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [otp, setOtp] = useState('')
  const [profileImage, setProfileImage] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)

  const [timeLeft, setTimeLeft] = useState(900) // 15 minutes
  const [resendLoading, setResendLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState('')
  const fileInputRef = useRef(null)

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

  const handleImageChange = (e) => {
    const file = e.target.files[0]
    if (file) {
      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        setErrors({ ...errors, image: 'Image too large (max 5MB)' })
        return
      }

      const reader = new FileReader()
      reader.onloadend = () => {
        setProfileImage(reader.result)
        setImagePreview(reader.result)
        const newErrors = { ...errors }
        delete newErrors.image
        setErrors(newErrors)
      }
      reader.readAsDataURL(file)
    }
  }

  const triggerFileInput = () => {
    if (fileInputRef.current) fileInputRef.current.click()
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
        const result = await signup(email, password, name, username, profileImage)
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
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-8 relative overflow-y-auto overflow-x-hidden bg-[#050505]">

      {/* Dynamic Animated Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          animate={{ scale: [1, 1.2, 1], opacity: [0.1, 0.15, 0.1], rotate: [0, 90, 0] }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full blur-[130px]"
          style={{ background: 'var(--primary)' }}
        />
        <motion.div
          animate={{ scale: [1, 1.5, 1], opacity: [0.05, 0.1, 0.05], rotate: [0, -90, 0] }}
          transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
          className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full blur-[140px]"
          style={{ background: 'var(--accent)' }}
        />
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `linear-gradient(var(--primary) 1px, transparent 1px), linear-gradient(90deg, var(--primary) 1px, transparent 1px)`,
          backgroundSize: '40px 40px'
        }}></div>
      </div>

      {/* Main Dual-Panel Card (Dark Glassmorphism) */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-[1130px] flex bg-[#0a0a0a]/80 backdrop-blur-2xl rounded-[2rem] border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.8)] min-h-[660px] relative z-10 overflow-hidden"
      >

        {/* LEFT PANEL: Skeleton Illustration with Logo */}
        <div className="hidden lg:flex flex-col w-[53%] relative p-12 justify-center items-center overflow-hidden border-r border-white/5 bg-black/30">

          {/* Logo with Radiating Square Waves at the Top Edge Center of the Illustration */}
          <div className="absolute top-10 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center">
            <div className="relative w-20 h-20 mb-4 flex items-center justify-center">
              {/* Corrected Radiating Square Waves */}
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{
                    opacity: [0, 0.5, 0],
                    scale: [0.8, 2.2],
                    rotate: 45
                  }}
                  transition={{
                    duration: 3,
                    repeat: Infinity,
                    delay: i * 1,
                    ease: "easeOut"
                  }}
                  className="absolute inset-0 border-2 border-[var(--primary)] rounded-xl pointer-events-none"
                  style={{ filter: 'drop-shadow(0 0 10px var(--primary))' }}
                />
              ))}

              <div className="relative z-10 w-16 h-16 rounded-2xl bg-black/60 border border-white/5 shadow-inner flex items-center justify-center overflow-hidden group">
                <img src="/login_logo.png" alt="Logo" className="w-10 h-10 object-contain group-hover:scale-110 transition-transform duration-300" />
                <div className="absolute inset-0 rounded-2xl border border-[var(--primary)]/10"></div>
              </div>
            </div>
          </div>

          {/* Subtle background glow for illustration */}
          <div className="absolute top-[20%] right-[30%] w-64 h-64 rounded-full bg-[var(--primary)] blur-[100px] opacity-20"></div>

          <div className="relative z-10 w-full flex flex-col items-center pt-20">
            {/* Displaying our generated skeleton image */}
            <img
              src="/skeleton-illustration.png"
              alt="Neural UI Skeleton"
              className="w-[85%] max-w-[450px] object-contain drop-shadow-[0_0_20px_var(--primary)]"
            />

            <div className="mt-8 flex flex-col items-center text-center">
              <h2 className="text-[28px] font-extrabold text-white mb-2 tracking-tighter uppercase">
                INTERACTING WITH COMPUTER BY JUST THINKING
              </h2>
              <p className="text-[var(--primary)] text-[13px] font-bold tracking-[0.1em] uppercase max-w-[320px] opacity-80">
                Synchronize with the neural network community
              </p>
            </div>
          </div>
        </div>

        {/* RIGHT PANEL: Form */}
        <div className="w-full lg:w-[47%] flex flex-col px-8 sm:px-14 py-10 justify-center relative">

          <div className="w-full max-w-[380px] mx-auto flex flex-col">

            {/* Header */}
            <div className="text-center mb-8 relative flex flex-col items-center">
              <h1 className="text-3xl font-black tracking-tighter mb-1 text-white uppercase">
                {isSignup ? 'CREATE VECTOR' : showOtp ? 'VERIFY ACCESS' : 'NEUROTECH LOGIN'}
              </h1>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--primary)] opacity-70">
                {isSignup ? 'Establish Neural Identity' : showOtp ? 'Enter transmission code' : 'Access Operator Interface'}
              </p>
            </div>

            {/* Alerts */}
            <AnimatePresence>
              {message && (
                <motion.div initial={{ opacity: 0, y: -10, height: 0 }} animate={{ opacity: 1, y: 0, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mb-4">
                  <div className="p-3 rounded-lg text-[11px] font-semibold bg-green-500/10 border border-green-500/20 text-green-400 flex items-center">
                    <CheckCircle2 className="w-4 h-4 mr-2" /> {message}
                  </div>
                </motion.div>
              )}
              {errors.form && (
                <motion.div initial={{ opacity: 0, y: -10, height: 0 }} animate={{ opacity: 1, y: 0, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mb-4">
                  <div className="p-3 rounded-lg text-[11px] font-semibold bg-red-500/10 border border-red-500/20 text-red-400 flex items-center">
                    <AlertCircle className="w-4 h-4 mr-2" /> {errors.form}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <form onSubmit={handleSubmit} className="w-full space-y-2">
              <AnimatePresence mode="wait">
                {showOtp ? (
                  // OTP VIEW
                  <motion.div key="otp" initial="hidden" animate="visible" exit="exit" variants={containerVariants} className="space-y-4">
                    <div className="mb-4 text-center">
                      <label className="block text-[10px] font-bold uppercase tracking-[0.2em] mb-4 opacity-70 text-[var(--primary)]">
                        Access Vector (OTP)
                      </label>
                      <input
                        type="text"
                        maxLength="4"
                        value={otp}
                        onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ''))}
                        className="w-full bg-black/50 backdrop-blur-md border border-white/10 rounded-2xl px-4 py-6 outline-none text-center text-5xl tracking-[1em] font-mono text-white shadow-inner focus:border-[var(--primary)] transition-all"
                        placeholder="0000"
                        style={{ borderColor: timeLeft < 60 ? '#ef4444' : undefined }}
                      />
                      <div className="flex items-center justify-center space-x-2 mt-4 text-xs font-mono opacity-60 text-white">
                        <RefreshCw className={`w-3 h-3 ${timeLeft < 60 ? 'text-red-400 animate-spin' : ''}`} />
                        <span className={timeLeft < 60 ? 'text-red-400' : ''}>Expiring in: {formatTime(timeLeft)}</span>
                      </div>
                      <button type="button" onClick={handleResend} disabled={resendLoading || timeLeft > 840} className="mt-3 text-[10px] uppercase font-bold tracking-widest text-[var(--accent)] hover:text-white transition-colors disabled:opacity-30">
                        {resendLoading ? 'Re-transmitting...' : 'Request New Vector'}
                      </button>
                    </div>
                  </motion.div>
                ) : (
                  // FORM VIEW
                  <motion.div key="form" initial="hidden" animate="visible" exit="exit" variants={containerVariants}>

                    {/* Avatar Upload for Signup */}
                    {isSignup && (
                      <motion.div variants={itemVariants} className="flex flex-col items-center mb-6">
                        <div className="relative group cursor-pointer" onClick={triggerFileInput}>
                          <div className={`w-24 h-24 rounded-full border-2 overflow-hidden bg-black/50 backdrop-blur-sm flex items-center justify-center transition-all duration-300 ${imagePreview ? 'border-[var(--primary)] shadow-[0_0_20px_var(--primary)]' : 'border-dashed border-white/20 hover:border-[var(--primary)]/50'}`}>
                            {imagePreview ? (
                              <img src={imagePreview} alt="Profile preview" className="w-full h-full object-cover" />
                            ) : (
                              <Camera className="w-8 h-8 text-white/30 group-hover:text-[var(--primary)]/70 transition-colors" />
                            )}
                          </div>
                          <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-[var(--primary)] text-black flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform">
                            <Upload size={14} className="font-bold" />
                          </div>
                          <input type="file" ref={fileInputRef} onChange={handleImageChange} accept="image/*" className="hidden" />
                        </div>
                        <span className="text-[9px] font-bold uppercase tracking-[0.2em] mt-3 opacity-60 text-white">Neural Avatar</span>
                        {errors.image && <span className="text-red-400 text-[9px] font-bold uppercase mt-1">{errors.image}</span>}
                      </motion.div>
                    )}

                    {isSignup ? (
                      <>
                        <div className="flex space-x-3 w-full">
                          <InputField icon={User} type="text" label="Your Name" placeholder="Your Name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} />
                          <InputField icon={User} type="text" label="Neural Identity" placeholder="neural_admin" value={username} onChange={(e) => setUsername(e.target.value)} error={errors.username} />
                        </div>
                        <InputField icon={Mail} type="email" label="Email Address" placeholder="mail@neuro.tech" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
                      </>
                    ) : (
                      <InputField icon={User} type="text" label="Neural Identity" placeholder="neural_admin" value={username} onChange={(e) => setUsername(e.target.value)} error={errors.username} />
                    )}

                    <InputField icon={Lock} type="password" label="Access Key" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} />

                    {!isSignup && !showOtp && (
                      <motion.div variants={itemVariants} className="flex items-center justify-between pt-1 pb-1">
                        <label className="flex items-center cursor-pointer">
                          <input type="checkbox" className="rounded border-white/10 bg-black/30 text-[var(--primary)] focus:ring-[var(--primary)] w-3 h-3 mr-2 accent-[var(--primary)] cursor-pointer" />
                          <span className="text-[10px] font-bold uppercase tracking-widest text-white/50 cursor-pointer">Stay Linked</span>
                        </label>
                        <a href="#" className="text-[10px] font-bold text-[var(--primary)] hover:text-white transition-colors" onClick={(e) => e.preventDefault()}>Reset Link?</a>
                      </motion.div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Submit Button */}
              <motion.div variants={itemVariants} className="pt-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-4 rounded-xl font-bold uppercase tracking-[0.2em] text-sm transition-all duration-300 relative overflow-hidden group border border-transparent hover:border-white/10 flex items-center justify-center shadow-lg"
                  style={{
                    background: loading ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg, var(--primary), var(--accent))',
                    color: loading ? 'rgba(255,255,255,0.5)' : '#000',
                    boxShadow: !loading ? '0 5px 25px -5px var(--primary)' : 'none'
                  }}
                >
                  <div className="absolute inset-0 bg-white/0 group-hover:bg-white/20 transition-colors duration-300"></div>
                  <span className="relative z-10 flex items-center justify-center font-black">
                    {loading ? (
                      <RefreshCw className="w-5 h-5 animate-spin mr-2" />
                    ) : showOtp ? (
                      'SYNCHRONIZE'
                    ) : isSignup ? (
                      'INITIALIZE OPERATOR'
                    ) : (
                      'ESTABLISH NEURAL LINK'
                    )}
                    {!loading && !showOtp && <ArrowRight className="w-5 h-5 ml-2 opacity-70 group-hover:translate-x-1 transition-transform" />}
                  </span>
                </button>
              </motion.div>
            </form>

            <div className="flex-grow min-h-[10px]"></div>

            {/* Footer Form Toggle */}
            <div className="mt-6 text-center pt-4 border-t border-white/5">
              <p className="text-[11px] font-bold uppercase tracking-widest text-white/40">
                {isSignup ? 'Already have an initial link?' : 'No neural ID established?'}
                <button type="button" onClick={() => { setIsSignup(!isSignup); setShowOtp(false); setErrors({}); }} className="text-[var(--primary)] font-black ml-2 hover:text-white transition-colors">
                  {isSignup ? 'Login here' : 'Create an account'}
                </button>
              </p>
            </div>

          </div>
        </div>
      </motion.div>
    </div>
  )
}
