import React, { useState, useEffect, useRef, useMemo } from 'react'
import SignalChart from '../charts/SignalChart'
import { DataService } from '../../services/DataService'
import { Radio, Square, Settings2, Wifi, Circle } from 'lucide-react'
import '../../styles/live/LiveView.css'

export default function LiveView({ wsData, wsEvent, config, isPaused }) {
  const defaultTimeWindowMs = config?.display?.timeWindowMs || 10000
  const samplingRate = config?.sampling_rate || 250
  const showGrid = config?.display?.showGrid ?? true
  const channelMapping = config?.channel_mapping || {}
  const numChannels = 2

  const activeChannels = useMemo(() => {
    const active = []
    for (let i = 0; i < numChannels; i++) {
      const key = `ch${i}`
      const chConfig = channelMapping[key]
      if (chConfig?.enabled !== false) active.push(i)
    }
    return active
  }, [channelMapping, numChannels])

  // Channel Configuration State (Zoom & Range)
  const [channelConfig, setChannelConfig] = useState({})

  // Refs for direct worker communication
  const chartRefs = useRef({});

  // Recording State
  const [isRecording, setIsRecording] = useState(false)
  const [recordingStartTime, setRecordingStartTime] = useState(null)
  const [recordingTime, setRecordingTime] = useState(0)
  const [recordedData, setRecordedData] = useState([])
  const [recordingChannels, setRecordingChannels] = useState([0, 1])
  const [isSaving, setIsSaving] = useState(false)

  // Update recording timer
  useEffect(() => {
    let interval = null
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingTime(Math.floor((Date.now() - recordingStartTime) / 1000))
      }, 1000)
    } else {
      setRecordingTime(0)
    }
    return () => clearInterval(interval)
  }, [isRecording, recordingStartTime])

  // Process Websocket Data
  useEffect(() => {
    if (!wsData || isPaused) return

    let basePayload = null
    try {
      basePayload = wsData.raw ?? (typeof wsData === 'string' ? JSON.parse(wsData) : wsData)

      // DEBUG: Log the first few payloads to see data shape in browser console
      if (!window._debugBatchCt) window._debugBatchCt = 0;
      if (window._debugBatchCt < 10) {
        console.log('[LiveView DEBUG] Received basePayload:', basePayload);
        window._debugBatchCt++;
      }

    } catch (e) {
      console.warn('[LiveView] Failed to parse wsData:', e)
      return
    }

    if (!basePayload) return

    const samples = basePayload._batch || basePayload.samples || (basePayload.channels ? [basePayload] : [])
    if (samples.length === 0) return

    const sampleIntervalMs = Math.round(1000 / (samplingRate || 250))

    const batchUpdates = { 0: [], 1: [], 2: [], 3: [] }
    const recordingUpdates = []

    samples.forEach(payload => {
      if (!payload.channels) return

      let incomingTs = Number(payload.timestamp)
      if (!incomingTs || incomingTs < 1e9) incomingTs = Date.now()

      if (!window.__lastTs) window.__lastTs = incomingTs
      if (incomingTs <= window.__lastTs) {
        incomingTs = window.__lastTs + sampleIntervalMs
      }
      window.__lastTs = incomingTs

      if (isRecording) {
        const recordPoint = { timestamp: incomingTs, channels: {} }
        let hasData = false
        recordingChannels.forEach(chNum => {
          Object.entries(payload.channels).forEach(([chIdx, chData]) => {
            if (parseInt(chIdx) === chNum) {
              let val = 0
              if (typeof chData === 'number') val = chData
              else if (typeof chData === 'object') val = chData.value ?? chData.val ?? 0
              recordPoint.channels[`ch${chNum}`] = val
              hasData = true
            }
          })
        })
        if (hasData) recordingUpdates.push(recordPoint)
      }

      Object.entries(payload.channels).forEach(([chIdx, chData]) => {
        const chNum = parseInt(chIdx.replace('ch', ''))
        if (isNaN(chNum)) return
        const chKey = `ch${chNum}`
        const chConfig = channelMapping[chKey]

        if (chConfig?.enabled === false) return

        let value = 0
        if (typeof chData === 'number') value = chData
        else if (typeof chData === 'object') value = chData.value ?? chData.val ?? 0

        if (!Number.isFinite(value)) return

        if (batchUpdates[chNum]) {
          batchUpdates[chNum].push({ time: incomingTs, value: Number(value) })
        }
      })
    })

    // Forward batches strictly to charts via Ref
    activeChannels.forEach(chIdx => {
      if (batchUpdates[chIdx] && batchUpdates[chIdx].length > 0) {
        chartRefs.current[chIdx]?.addData(batchUpdates[chIdx])
      }
    })

    if (recordingUpdates.length > 0) {
      setRecordedData(prev => [...prev, ...recordingUpdates])
    }

  }, [wsData, isPaused, channelMapping, samplingRate, isRecording, recordingChannels, activeChannels])

  useEffect(() => {
    setChannelConfig(prev => {
      const next = { ...prev }
      let changed = false
      activeChannels.forEach((chIdx, i) => {
        if (!next[chIdx]) {
          const defaultColor = ['#3b82f6', '#10b981', '#f59e0b', '#a855f7'][i % 4]
          next[chIdx] = { zoom: 1, manualRange: "", timeWindowMs: defaultTimeWindowMs, color: defaultColor }
          changed = true
        }
      })
      return changed ? next : prev
    })
  }, [activeChannels, defaultTimeWindowMs])

  const updateChannelConfig = (chIdx, key, value) => {
    setChannelConfig(prev => ({
      ...prev,
      [chIdx]: { ...prev[chIdx], [key]: value }
    }))
  }

  // Handle Annotations (Blinks)
  const [annotations, setAnnotations] = useState([])

  useEffect(() => {
    if (!wsEvent) return
    if (wsEvent.event === 'BLINK') {
      const ts = wsEvent.timestamp ? wsEvent.timestamp * 1000 : Date.now()
      const chKey = wsEvent.channel

      setAnnotations(prev => [
        ...prev,
        {
          x: ts,
          label: 'BLINK',
          color: '#ef4444',
          channel: chKey
          // removing 'y' coordinate, worker will handle placing it dynamically
        }
      ].slice(-20))
    }
  }, [wsEvent])

  useEffect(() => {
    const now = Date.now()
    // Periodic cleanup of very old annotations (run every 5s)
    const interval = setInterval(() => {
      setAnnotations(prev => prev.filter(a => (Date.now() - a.x) < 30000))
    }, 5000);
    return () => clearInterval(interval);
  }, [])

  const toggleRecording = async () => {
    if (!isRecording) {
      setRecordedData([])
      setRecordingStartTime(Date.now())
      setIsRecording(true)
    } else {
      setIsRecording(false)
      setIsSaving(true)

      try {
        const now = new Date()
        const day = String(now.getDate()).padStart(2, '0')
        const month = String(now.getMonth() + 1).padStart(2, '0')
        const year = now.getFullYear()
        const hours = String(now.getHours()).padStart(2, '0')
        const mins = String(now.getMinutes()).padStart(2, '0')
        const secs = String(now.getSeconds()).padStart(2, '0')

        const firstCh = recordingChannels[0]
        const sensorType = channelMapping[`ch${firstCh}`]?.sensor || 'DATA'
        const filename = `${sensorType}__${day}-${month}-${year}__${hours}-${mins}-${secs}.json`

        const payload = {
          metadata: {
            sensorType,
            channels: recordingChannels,
            samplingRate,
            startTime: recordingStartTime,
            endTime: Date.now(),
            duration: recordingTime
          },
          data: recordedData
        }

        await DataService.saveSession(filename, payload)
        alert(`Session saved successfully as ${filename}`)
      } catch (err) {
        console.error('Failed to save session:', err)
        alert('Failed to save session. Check console for details.')
      } finally {
        setIsSaving(false)
        setRecordedData([])
      }
    }
  }

  return (
    <div className="live-view-container">
      <div className="h-[94px] shrink-0" />
      <div className="controls-container flex flex-row justify-between">
        <div className="flex flex-row gap-2">
          <div className="record-controls">
            <button
              onClick={toggleRecording}
              disabled={isSaving || (activeChannels.length === 0 && !isRecording)}
              className={`record-btn ${isRecording ? 'recording' : 'idle'}`}
            >
              {isRecording ? <Square size={16} fill="currentColor" /> : <Radio size={16} />}
              {isRecording ? `STOP (${recordingTime}s)` : 'REC'}
            </button>
            {isSaving && <div className="saving-indicator">SAVING...</div>}
          </div>
          <div>
            {isRecording && <div className="recording-status">● RECORDING IN PROGRESS</div>}
          </div>
        </div>

        <div className="flex flex-row gap-2">
          <div className="mode-indicator">
            <span className="text-primary font-bold flex items-center gap-2 w-auto"><Settings2 size={16} /> MODE:</span>
            INDEPENDENT SCALING
            <span className='separator'></span>
            <div className="flex items-center gap-2"><span className="text-purple-400 flex items-center gap-1"><Wifi size={16} /> Stream</span>: {wsData?.raw?.stream_name || 'Disconnected'}</div>
          </div>
        </div>
      </div>

      {Array.from({ length: numChannels }).map((_, chIdx) => {
        const isEnabled = activeChannels.includes(chIdx);
        if (!isEnabled) return null; // We strict render only enabled

        const sensorName = channelMapping[`ch${chIdx}`]?.sensor
        const currentZoom = channelConfig[chIdx]?.zoom || 1
        const currentManual = channelConfig[chIdx]?.manualRange || ""
        const currentTimeWindow = channelConfig[chIdx]?.timeWindowMs || defaultTimeWindowMs
        const currentChColor = channelConfig[chIdx]?.color || ['#3b82f6', '#10b981', '#f59e0b', '#a855f7'][chIdx % 4]

        return (
          <div key={chIdx} className="channel-wrapper">
            <SignalChart
              ref={el => chartRefs.current[chIdx] = el}
              graphNo={`Graph ${chIdx + 1}`}
              title={`${sensorName}`}
              disabled={!isEnabled}
              timeWindowMs={currentTimeWindow}
              color={currentChColor}
              height="100%"
              showGrid={showGrid}
              annotations={annotations.filter(a => a.channel === `ch${chIdx}`)}
              currentZoom={currentZoom}
              currentManual={currentManual}
              onZoomChange={(z) => { updateChannelConfig(chIdx, 'zoom', z); updateChannelConfig(chIdx, 'manualRange', ""); }}
              onRangeChange={(val) => updateChannelConfig(chIdx, 'manualRange', val)}
              onTimeWindowChange={(val) => updateChannelConfig(chIdx, 'timeWindowMs', val)}
              onColorChange={(val) => updateChannelConfig(chIdx, 'color', val)}
            />
          </div>
        )
      })}
    </div>
  )
}
