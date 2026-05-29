import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

/**
 * Admin-only button that syncs all local users (data/users/) to the remote server.
 * Only renders when the current user has is_admin=true AND is logged in via local auth.
 */
export default function SyncButton() {
  const { isAdmin, isLocalAuth, syncToServer } = useAuth()
  const [state, setState] = useState('idle') // 'idle' | 'loading' | 'success' | 'error'
  const [message, setMessage] = useState('')

  if (!isAdmin || !isLocalAuth) return null

  const handleSync = async () => {
    setState('loading')
    setMessage('')
    const result = await syncToServer()
    if (result.status === 'success') {
      const count = result.synced ?? 0
      setMessage(`${count} user${count !== 1 ? 's' : ''} synced`)
      setState('success')
    } else {
      setMessage(result.message || 'Sync failed')
      setState('error')
    }
    setTimeout(() => {
      setState('idle')
      setMessage('')
    }, 4000)
  }

  return (
    <div className="flex items-center gap-2">
      <motion.button
        onClick={handleSync}
        disabled={state === 'loading'}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.97 }}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest border transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          background: 'rgba(0,242,254,0.08)',
          borderColor: 'rgba(0,242,254,0.3)',
          color: 'var(--primary)',
        }}
        title="Sync all local users to remote server"
      >
        {state === 'loading' ? (
          <Loader2 size={12} className="animate-spin" />
        ) : (
          <Upload size={12} />
        )}
        {state === 'loading' ? 'Syncing…' : 'Sync to Server'}
      </motion.button>

      <AnimatePresence>
        {message && (
          <motion.span
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-1 text-[10px] font-semibold"
            style={{ color: state === 'success' ? '#4ade80' : '#f87171' }}
          >
            {state === 'success'
              ? <CheckCircle2 size={11} />
              : <AlertCircle size={11} />}
            {message}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  )
}
