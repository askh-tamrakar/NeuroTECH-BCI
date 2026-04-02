import { useState } from 'react'
import { Cable, Zap, Plug } from 'lucide-react'
import ElectricBorder from '../overlays/ElectricBorder.jsx'
import { soundHandler } from '../../../handlers/SoundHandler.js'

function getButtonTheme(status) {
    if (status === 'streaming') {
        return {
            border: '#10b981',
            classes: 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/30 shadow-emerald-500/50',
            label: 'STREAMING',
            icon: <Cable size={24} className="text-emerald-400" />
        }
    }

    if (status === 'connected' || status === 'stream_offline') {
        return {
            border: '#06b6d4',
            classes: 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/30 shadow-cyan-500/40',
            label: 'CONNECTED',
            icon: <Cable size={24} className="text-cyan-400" />
        }
    }

    if (status === 'connecting') {
        return {
            border: '#f59e0b',
            classes: 'bg-amber-500/20 border-amber-500/50 text-amber-400 shadow-amber-500/20',
            label: 'CONNECTING',
            icon: <Zap size={24} className="text-amber-400 animate-pulse" />
        }
    }

    return {
        border: '#ef4444',
        classes: 'bg-red-500/20 border-red-500/50 text-red-400 hover:bg-red-500/30 shadow-red-500/20',
        label: 'DISCONNECTED',
        icon: <Plug size={24} className="text-red-400" />
    }
}

export function ConnectionButton({ status, latency, connect, disconnect }) {
    const [isConnectingClicked, setIsConnectingClicked] = useState(false)
    const [isSimulatedConnecting, setIsSimulatedConnecting] = useState(false)

    const isConnectedState = status === 'connected' || status === 'streaming' || status === 'stream_offline'

    const handleConnectClick = () => {
        soundHandler.playConnectionZap()
        setIsConnectingClicked(true)
        setTimeout(() => setIsConnectingClicked(false), 200)

        if (isConnectedState) {
            disconnect()
            return
        }

        setIsSimulatedConnecting(true)
        connect()
        setTimeout(() => {
            setIsSimulatedConnecting(false)
        }, 200)
    }

    const currentDisplayStatus = isSimulatedConnecting ? 'connecting' : status
    const theme = getButtonTheme(currentDisplayStatus)
    const widthClass = isConnectedState ? 'min-w-[9rem]' : 'min-w-[8.5rem]'

    return (
        <ElectricBorder
            color={theme.border}
            speed={1.2}
            chaos={0.05}
            thickness={2}
            className={`rounded-full ${widthClass}`}
            style={{ borderRadius: 999 }}
        >
            <button
                onClick={handleConnectClick}
                className={`
        flex items-center justify-center gap-2 px-4 py-2.5 rounded-full border shadow-lg
        font-bold text-sm tracking-wide
        transition-all duration-200 ease-in-out
        w-full h-full
        ${isConnectingClicked ? 'scale-95 shadow-none' : 'scale-100'}
        ${theme.classes}
      `}
            >
                <div className="flex flex-row items-center gap-2">
                    {theme.icon}
                    <span className="flex flex-row min-w-[12ch] text-sm font-bold uppercase tracking-wider">
                        {theme.label}
                    </span>
                </div>

                {isConnectedState && (
                    <div className="flex flex-row items-center justify-end">
                        <div className="w-[1px] h-4 bg-current opacity-30 mx-1.5" />
                        <span className="text-xs font-mono opacity-80 tabular-nums min-w-[4ch] text-right">
                            {latency}ms
                        </span>
                    </div>
                )}
            </button>
        </ElectricBorder>
    )
}

export default ConnectionButton
