import React, { useState, useEffect, useRef } from 'react'
import Sidebar from '../live/Sidebar'
import LiveView from '../live/LiveView'
import Brain3D from '../ui/display/Brain3D'
import FirmwareModal from '../live/FirmwareModal'
import LoadingScreen from '../ui/display/LoadingScreen'
import { ConfigService } from '../../services/ConfigService'
import { DataService } from '../../services/DataService'
import '../../styles/live/LiveDashboard.css'

export default function LiveDashboard({ wsData, wsConfig, wsEvent, sendMessage, wsUrl, status, latency, connect, disconnect, mobileMainView, setMobileMainView }) {
    const [config, setConfig] = useState()
    const [isPaused, setIsPaused] = useState(() => {
        const saved = localStorage.getItem('liveDashboardIsPaused')
        return saved ? JSON.parse(saved) : false
    })
    const [loading, setLoading] = useState(true)

    // Recording States
    const [isRecording, setIsRecording] = useState(false)
    const [isPausedRecording, setIsPausedRecording] = useState(false)
    const [recordingStartTime, setRecordingStartTime] = useState(null)
    const [lastPauseTime, setLastPauseTime] = useState(null)
    const [totalPausedDuration, setTotalPausedDuration] = useState(0)
    const [recordingTime, setRecordingTime] = useState(0)
    const [recordingChannels, setRecordingChannels] = useState([0, 1])
    const [isSaving, setIsSaving] = useState(false)
    const [isConfirmationPending, setIsConfirmationPending] = useState(false)
    const [isFirmwareModalOpen, setIsFirmwareModalOpen] = useState(false)
    const [hybridResult, setHybridResult] = useState(null)

    // Use Ref for Performance
    const recordedDataRef = useRef([])

    // Save isPaused to localStorage whenever it changes
    useEffect(() => {
        localStorage.setItem('liveDashboardIsPaused', JSON.stringify(isPaused))
    }, [isPaused])

    // Timer for recording duration
    useEffect(() => {
        let timer;
        if (isRecording && !isPausedRecording && recordingStartTime) {
            timer = setInterval(() => {
                setRecordingTime(Math.floor((Date.now() - recordingStartTime - totalPausedDuration) / 1000));
            }, 1000);
        }
        return () => clearInterval(timer);
    }, [isRecording, isPausedRecording, recordingStartTime, totalPausedDuration]);

    // Load config on mount
    useEffect(() => {
        ConfigService.loadConfig().then(cfg => {
            setConfig(cfg)
            setLoading(false)
        })
    }, [])

    // Sync incoming config from WebSocket
    useEffect(() => {
        if (wsConfig) {
            setConfig(wsConfig)
            localStorage.setItem('biosignals-config', JSON.stringify(wsConfig))
        }
    }, [wsConfig])

    const handleManualSave = (updatedConfig) => {
        const configToSave = (updatedConfig && !updatedConfig.type) ? updatedConfig : config
        if (!configToSave) return
        ConfigService.saveConfig(configToSave)
        if (sendMessage) {
            sendMessage({ type: 'SAVE_CONFIG', config: configToSave })
        }
    }

    // Recording Actions — uses server-side hybrid recorder (CSV + metadata.json)
    const startRecording = async () => {
        recordedDataRef.current = []
        setHybridResult(null)
        setRecordingStartTime(Date.now())
        setTotalPausedDuration(0)
        setIsRecording(true)
        setIsPausedRecording(false)
        setIsConfirmationPending(false)

        try {
            const result = await DataService.startHybridRecording(recordingChannels, 'raw')
            console.log('[LiveDashboard] Hybrid recording started:', result)
        } catch (err) {
            console.error('[LiveDashboard] Failed to start hybrid recording:', err)
            setIsRecording(false)
        }
    }

    const togglePauseRecording = async () => {
        if (!isPausedRecording) {
            setIsPausedRecording(true)
            setLastPauseTime(Date.now())
            DataService.pauseHybridRecording().catch(e => console.warn('Pause error:', e))
        } else {
            const pausedAt = lastPauseTime || Date.now()
            setTotalPausedDuration(prev => prev + (Date.now() - pausedAt))
            setIsPausedRecording(false)
            setLastPauseTime(null)
            DataService.resumeHybridRecording().catch(e => console.warn('Resume error:', e))
        }
    }

    const stopRecording = async () => {
        setIsRecording(false)
        setIsPausedRecording(false)

        try {
            const result = await DataService.stopHybridRecording()
            console.log('[LiveDashboard] Hybrid recording stopped:', result)
            setHybridResult(result)
        } catch (err) {
            console.error('[LiveDashboard] Failed to stop hybrid recording:', err)
        }

        setIsConfirmationPending(true)
    }

    const discardRecording = async () => {
        // Delete the server-side recording files
        if (hybridResult?.path) {
            try {
                const base = (await import('../../utils/runtimeConnection')).getBaseDataDir?.()
                // Build relative path from the full path
                const relPath = hybridResult.path.split(/[\\/]data[\\/]/).pop()
                if (relPath) await DataService.deleteHybridRecording(relPath)
            } catch (e) {
                console.warn('[LiveDashboard] Delete error:', e)
            }
        }
        recordedDataRef.current = []
        setHybridResult(null)
        setIsConfirmationPending(false)
        setRecordingTime(0)
    }

    const saveRecording = async () => {
        // With hybrid recording the data is already saved server-side.
        // "Save" just clears the confirmation UI.
        setIsSaving(true)
        try {
            setIsConfirmationPending(false)
            recordedDataRef.current = []
            console.log('[LiveDashboard] Recording kept:', hybridResult?.session)
        } finally {
            setIsSaving(false)
        }
    }

    const recordState = {
        isRecording, isPausedRecording, recordingTime, recordingChannels,
        isSaving, isConfirmationPending, isFirmwareModalOpen,
        recordingStartTime, totalPausedDuration, recordedDataRef,
        hybridResult
    }

    const recordHandlers = {
        startRecording, togglePauseRecording, stopRecording,
        discardRecording, saveRecording, setRecordingChannels,
        setIsFirmwareModalOpen, setRecordingTime
    }

    if (loading) return <LoadingScreen fullscreen label="Loading config..." />

    // Render Logic for Mobile Swap
    const isMobileSettings = mobileMainView === 'settings';

    return (
        <div className="dashboard-container relative">
            <Sidebar
                config={config}
                setConfig={setConfig}
                isPaused={isPaused}
                setIsPaused={setIsPaused}
                onSave={handleManualSave}
                mobileMainView={mobileMainView}
                setMobileMainView={setMobileMainView}
                recordState={recordState}
                recordHandlers={recordHandlers}
                connectionProps={{ status, latency, connect, disconnect }}
                className={`sidebar-fixed z-30 transition-all ${isMobileSettings ? 'absolute inset-0 w-full' : ''}`}
            />

            <main className={`main-content ${isMobileSettings ? 'hidden md:flex' : ''}`}>
                <div className="live-view-wrapper">
                    {mobileMainView === '3dbrain' ? (
                        <div className="w-full h-full flex items-center justify-center p-4">
                            <Brain3D />
                        </div>
                    ) : (
                        <LiveView
                            wsData={wsData}
                            wsEvent={wsEvent}
                            config={config}
                            isPaused={isPaused}
                            wsUrl={wsUrl}
                            recordState={recordState}
                            recordHandlers={recordHandlers}
                        />
                    )}
                </div>
            </main>

            {/* Modals */}
            <FirmwareModal
                isOpen={isFirmwareModalOpen}
                onClose={() => setIsFirmwareModalOpen(false)}
            />
        </div>
    )
}
