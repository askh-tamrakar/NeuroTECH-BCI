import React, { useState, useEffect, useRef } from 'react'
import Sidebar from '../ui/Sidebar'
import LiveView from '../views/LiveView'
import Brain3D from '../ui/3d_Brain'
import FirmwareModal from '../modals/FirmwareModal'
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
    
    // Use Ref for Performance
    const recordedDataRef = useRef([])

    // Save isPaused to localStorage whenever it changes
    useEffect(() => {
        localStorage.setItem('liveDashboardIsPaused', JSON.stringify(isPaused))
    }, [isPaused])

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

    // Recording Actions
    const startRecording = () => {
        recordedDataRef.current = []
        setRecordingStartTime(Date.now())
        setTotalPausedDuration(0)
        setIsRecording(true)
        setIsPausedRecording(false)
        setIsConfirmationPending(false)
    }

    const togglePauseRecording = () => {
        if (!isPausedRecording) {
            setIsPausedRecording(true)
            setLastPauseTime(Date.now())
        } else {
            const pausedAt = lastPauseTime || Date.now()
            setTotalPausedDuration(prev => prev + (Date.now() - pausedAt))
            setIsPausedRecording(false)
            setLastPauseTime(null)
        }
    }

    const stopRecording = () => {
        setIsRecording(false)
        setIsPausedRecording(false)
        setIsConfirmationPending(true)
    }

    const discardRecording = () => {
        recordedDataRef.current = []
        setIsConfirmationPending(false)
        setRecordingTime(0)
    }

    const saveRecording = async () => {
        setIsSaving(true)
        try {
            const now = new Date()
            const day = String(now.getDate()).padStart(2, '0')
            const month = String(now.getMonth() + 1).padStart(2, '0')
            const year = now.getFullYear()
            const hours = String(now.getHours()).padStart(2, '0')
            const mins = String(now.getMinutes()).padStart(2, '0')
            const secs = String(now.getSeconds()).padStart(2, '0')

            const channelMapping = config?.channel_mapping || {}
            const samplingRate = config?.sampling_rate || 1000

            const sensorsToRecord = {};
            recordingChannels.forEach(chNum => {
                const sensorType = channelMapping[`ch${chNum}`]?.sensor || 'DATA';
                if (!sensorsToRecord[sensorType]) sensorsToRecord[sensorType] = [];
                sensorsToRecord[sensorType].push(chNum);
            });

            const sensorTypes = Object.keys(sensorsToRecord);
            if (sensorTypes.length === 0) {
                setIsSaving(false);
                recordedDataRef.current = [];
                setIsConfirmationPending(false);
                return;
            }

            const currentData = recordedDataRef.current;

            const savePromises = sensorTypes.map(async (sensorType) => {
                const channelsForThisSensor = sensorsToRecord[sensorType];
                const filename = `${sensorType}__${day}-${month}-${year}__${hours}-${mins}-${secs}.csv`

                const filteredData = currentData.map(point => {
                    const filteredPoint = { timestamp: point.timestamp, channels: {} };
                    let hasDataForSensor = false;
                    channelsForThisSensor.forEach(chNum => {
                        if (point.channels[`ch${chNum}`] !== undefined) {
                            filteredPoint.channels[`ch${chNum}`] = point.channels[`ch${chNum}`];
                            hasDataForSensor = true;
                        }
                    });
                    return hasDataForSensor ? filteredPoint : null;
                }).filter(Boolean);

                if (filteredData.length === 0) return;

                const payload = {
                    metadata: {
                        sensorType,
                        channels: channelsForThisSensor,
                        samplingRate,
                        startTime: recordingStartTime,
                        endTime: Date.now(),
                        duration: recordingTime
                    },
                    data: filteredData
                }

                return DataService.saveSession(filename, payload, sensorType)
            });

            await Promise.all(savePromises);
            setIsConfirmationPending(false);
            recordedDataRef.current = [];
        } catch (err) {
            console.error('Failed to save multi-sensor session:', err)
        } finally {
            setIsSaving(false)
        }
    }

    const recordState = {
        isRecording, isPausedRecording, recordingTime, recordingChannels,
        isSaving, isConfirmationPending, isFirmwareModalOpen,
        recordingStartTime, totalPausedDuration, recordedDataRef
    }

    const recordHandlers = {
        startRecording, togglePauseRecording, stopRecording,
        discardRecording, saveRecording, setRecordingChannels,
        setIsFirmwareModalOpen, setRecordingTime
    }

    if (loading) return <div className="loading-screen">Loading Config...</div>

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
                connectionProps={{status, latency, connect, disconnect}}
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
