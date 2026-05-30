import React from 'react'
import { motion } from 'framer-motion'
import { BrainCircuit } from 'lucide-react'

/**
 * LoadingScreen
 *
 * @param {string}  label      - Optional text shown below the icon. Defaults to "Loading..."
 * @param {boolean} fullscreen - When true fills the whole viewport (min-h-screen).
 *                               When false fills the parent container (h-full / flex-1).
 */
export default function LoadingScreen({ label = 'Loading...', fullscreen = false }) {
    return (
        <div
            className={`flex flex-col items-center justify-center gap-4 ${
                fullscreen ? 'min-h-screen w-full' : 'flex-1 h-full w-full min-h-[200px]'
            }`}
        >
            {/* Outer pulse ring */}
            <div className="relative flex items-center justify-center">
                <motion.div
                    animate={{ scale: [1, 1.6, 1], opacity: [0.4, 0, 0.4] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                    className="absolute w-16 h-16 rounded-full border-2 border-[var(--primary)]"
                />
                <motion.div
                    animate={{ scale: [1, 1.35, 1], opacity: [0.25, 0, 0.25] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
                    className="absolute w-16 h-16 rounded-full border border-[var(--primary)]"
                />

                {/* Icon */}
                <motion.div
                    animate={{ opacity: [0.7, 1, 0.7] }}
                    transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                    className="relative z-10 p-3 rounded-xl"
                >
                    <BrainCircuit size={28} className="text-[var(--primary)]" />
                </motion.div>
            </div>

            {/* Label */}
            {label && (
                <motion.p
                    animate={{ opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                    className="text-[11px] font-bold uppercase tracking-[0.25em] text-[var(--muted)]"
                >
                    {label}
                </motion.p>
            )}
        </div>
    )
}
