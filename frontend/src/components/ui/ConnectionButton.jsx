import { useState } from 'react'
<<<<<<< HEAD
import { Cable, Zap, Plug, Play, Square, Activity } from 'lucide-react'
import ElectricBorder from './ElectricBorder.jsx'
import { soundHandler } from '../../handlers/SoundHandler.js'

export function ConnectionButton({
    isConnected,
    isAcquiring,
    connect,
    disconnect,
    startAcquisition,
    stopAcquisition
}) {
    const [isThinking, setIsThinking] = useState(false)

    const handleMainClick = async () => {
        if (isThinking) return; // Prevent double clicks
        soundHandler.playConnectionZap()
        setIsThinking(true)

        try {
            if (isConnected) {
                await disconnect()
            } else {
                await connect()
            }
        } catch (err) {
            console.error(err)
        } finally {
            setIsThinking(false)
        }
    }

    const handleAcquisitionClick = (e) => {
        e.stopPropagation();
        if (isAcquiring) {
            stopAcquisition();
        } else {
            startAcquisition();
        }
    };

    // Determine Status for Visuals
    let statusColor = '#ef4444' // Red (Disconnected)
    let statusText = 'DISCONNECTED'
    let StatusIcon = Plug
    let btnClasses = 'bg-red-500/10 border-red-500/50 text-red-400 hover:bg-red-500/20 shadow-red-500/20'

    if (isThinking) {
        statusColor = '#f59e0b' // Amber (Connecting)
        statusText = 'CONNECTING...'
        StatusIcon = Zap // Zap icon, pulsing
        btnClasses = 'bg-amber-500/10 border-amber-500/50 text-amber-400 cursor-wait shadow-amber-500/20'
    } else if (isConnected) {
        statusColor = '#10b981' // Emerald (Connected)
        statusText = 'CONNECTED'
        StatusIcon = Cable
        btnClasses = 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/20 shadow-emerald-500/20'
    }

    return (
        <div className="flex items-center flex-row-reverse relative">

            {/* Main Connection Button - Z-Index 20 to sit ON TOP. Rightmost element. */}
            <div className="relative z-20">
                <ElectricBorder
                    color={statusColor}
                    speed={1.5}
                    chaos={0.05}
                    thickness={2}
                    className={`rounded-full transition-all duration-300 ${isConnected ? 'min-w-[10rem]' : 'min-w-[9rem]'}`}
                    style={{ borderRadius: 999 }}
                >
                    <button
                        onClick={handleMainClick}
                        disabled={isThinking}
                        className={`
                            flex items-center justify-center gap-3 px-4 py-2.5 rounded-full border shadow-lg
                            font-bold text-sm tracking-wide
                            transition-all duration-300 ease-out
                            w-full h-full
                            ${btnClasses}
                        `}
                    >
                        <div className="flex items-center gap-2">
                            <StatusIcon className={`w-5 h-5 ${isThinking ? 'animate-pulse' : ''}`} />
                            <span>{statusText}</span>
                        </div>
                    </button>
                </ElectricBorder>
            </div>

            {/* Acquisition Button - Slides out to the LEFT from behind the Main Button */}
            <div
                className={`
                    relative z-10
                    transition-all duration-700 cubic-bezier(0.34, 1.56, 0.64, 1) ease-in-out
                    flex items-center justify-end
                    ${isConnected
                        ? 'mr-2 opacity-100 translate-x-0' // Visible, spaced out
                        : '-mr-[90px] opacity-0 translate-x-[50px] pointer-events-none' // Hidden, tucked to the right (behind main)
                    }
                `}
            >
                <button
                    onClick={handleAcquisitionClick}
                    className={`
                        flex items-center gap-2 px-5 py-2.5 rounded-full border shadow-lg font-bold text-sm tracking-wide
                        transition-all duration-200 hover:brightness-110 active:scale-95 whitespace-nowrap
                        ${isAcquiring
                            ? 'bg-amber-500/20 border-amber-500 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.3)] animate-pulse'
                            : 'bg-primary/20 border-primary text-primary shadow-primary/20'
                        }
                    `}
                >
                    {isAcquiring ? (
                        <>
                            <Square className="w-4 h-4 fill-current" />
                            <span>STOP</span>
                        </>
                    ) : (
                        <>
                            <Play className="w-4 h-4 fill-current" />
                            <span>START</span>
                        </>
                    )}
                </button>
            </div>
        </div>
=======
import { Cable, Zap, Plug } from 'lucide-react'
import ElectricBorder from './ElectricBorder.jsx'
import { soundHandler } from '../../handlers/SoundHandler.js'

export function ConnectionButton({ status, latency, connect, disconnect }) {
    const [isConnectingClicked, setIsConnectingClicked] = useState(false)
    const [isSimulatedConnecting, setIsSimulatedConnecting] = useState(false)

    const handleConnectClick = () => {
        soundHandler.playConnectionZap()
        setIsConnectingClicked(true)
        setTimeout(() => setIsConnectingClicked(false), 200)

        if (status === 'connected') {
            disconnect()
        } else {
            setIsSimulatedConnecting(true)
            connect()
            setTimeout(() => {
                setIsSimulatedConnecting(false)
            }, 200)
        }
    }

    const currentDisplayStatus = isSimulatedConnecting ? 'connecting' : status

    const ConnectionIcon = ({ status }) => {
        if (status === 'connected') return <Cable className="w-5 h-5 text-emerald-400" />
        if (status === 'connecting') return <Zap className="w-5 h-5 text-amber-400 animate-pulse" />
        return <Plug className="w-5 h-5 text-red-400" />
    }

    // base width ~18 (small) when not connected, slightly larger when connected
    const widthClass =
        currentDisplayStatus === 'connected'
            ? 'min-w-[9rem]'   // 9rem ≈ 144px (base + +4–6px equivalent)
            : 'min-w-[8.5rem]' // 8.5rem ≈ 136px (connecting/disconnected)

    return (
        <ElectricBorder
            color={
                currentDisplayStatus === 'connected' ? '#10b981' : // Emerald
                    currentDisplayStatus === 'connecting' ? '#f59e0b' : // Amber
                        '#ef4444' // Red
            }
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
        ${currentDisplayStatus === 'connected'
                        ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/30 shadow-emerald-500/50'
                        : currentDisplayStatus === 'connecting'
                            ? 'bg-amber-500/20 border-amber-500/50 text-amber-400 shadow-amber-500/20'
                            : 'bg-red-500/20 border-red-500/50 text-red-400 hover:bg-red-500/30 shadow-red-500/20'
                    }
      `}
            >
                {/* Left side: icon + text, always centered within the button */}
                <div className="flex items-center gap-2">
                    <ConnectionIcon status={currentDisplayStatus} />
                    <span className="text-sm font-bold uppercase tracking-wider">
                        {currentDisplayStatus === 'connected'
                            ? 'CONNECTED'
                            : currentDisplayStatus === 'connecting'
                                ? 'CONNECTING'
                                : 'DISCONNECTED'}
                    </span>
                </div>

                {/* Right side: latency only when actually connected */}
                {status === 'connected' && (
                    <div className="flex items-center justify-end">
                        <div className="w-[1px] h-4 bg-current opacity-30 mx-1.5" />
                        <span className="text-xs font-mono opacity-80 tabular-nums min-w-[4ch] text-right">
                            {latency}ms
                        </span>
                    </div>
                )}
            </button>
        </ElectricBorder>
>>>>>>> extra-features
    )
}

export default ConnectionButton
