import React, { useState, useEffect, useRef, useMemo } from 'react'
import SignalChart from '../charts/SignalChart'
import { DataService } from '../../services/DataService'
import { Radio, Square, Settings2, Wifi, Circle, Play, Pause, Save, Trash2, Check, X } from 'lucide-react'
import '../../styles/live/LiveView.css'

export default function LiveView({ wsData, wsEvent, config, isPaused, wsUrl }) {
  const defaultTimeWindowMs = config?.display?.timeWindowMs || 10000
  const samplingRate = config?.sampling_rate || 250
  const showGrid = config?.display?.showGrid ?? true
  const channelMapping = config?.channel_mapping || {}
  const numChannels = 2



  // Channel Configuration State (Zoom & Range)
  const [channelConfig, setChannelConfig] = useState(() => {
    const saved = localStorage.getItem('liveViewChannelConfig')
    return saved ? JSON.parse(saved) : {}
  })

  // Refs for direct worker communication
  const chartRefs = useRef({});

  // Recording State
  const [isRecording, setIsRecording] = useState(false)
  const [isPausedRecording, setIsPausedRecording] = useState(false)
  const [recordingStartTime, setRecordingStartTime] = useState(null)
  const [lastPauseTime, setLastPauseTime] = useState(null)
  const [totalPausedDuration, setTotalPausedDuration] = useState(0)
  const [recordingTime, setRecordingTime] = useState(0)
  const [recordedData, setRecordedData] = useState([])
  const [recordingChannels, setRecordingChannels] = useState([0, 1])
  const [isSaving, setIsSaving] = useState(false)
  const [isConfirmationPending, setIsConfirmationPending] = useState(false)
  const [annotations, setAnnotations] = useState([])

  // Channels are 0 and 1
  const activeChannels = [0, 1];

  // Data Worker Instance
  const dataWorkerRef = useRef(null);

  // Data Worker initialization - only re-connect if wsUrl changes
  useEffect(() => {
    if (!wsUrl) return;

    console.log('[LiveView] Initializing DataWorker...');
    const worker = new Worker(new URL('../../workers/data.worker.js', import.meta.url), { type: 'module' });
    dataWorkerRef.current = worker;

    worker.onmessage = (e) => {
      const { type, payload } = e.data;
      if (type === 'EVENT') {
        if (payload.event === 'BLINK') {
          const ts = payload.timestamp ? payload.timestamp * 1000 : Date.now();
          setAnnotations(prev => [
            ...prev,
            { x: ts, label: 'BLINK', color: '#ef4444', channel: payload.channel }
          ].slice(-20));
        }
      }
    };

    worker.postMessage({ type: 'CONNECT', payload: { url: wsUrl } });

    return () => {
      console.log('[LiveView] Terminating DataWorker...');
      worker.terminate();
    };
  }, [wsUrl]);

  // Recording Logic - separate effect that listens to the existing worker
  useEffect(() => {
    if (!dataWorkerRef.current || !isRecording || isPausedRecording) return;

    const handleMessage = (e) => {
      const { type, payload } = e.data;
      if (type === 'UI_UPDATE' && !isPaused) {
        const { lastSample } = payload;
        if (lastSample && lastSample.channels) {
          const recordPoint = { timestamp: lastSample.timestamp, channels: {} };
          let hasData = false;
          recordingChannels.forEach(chNum => {
            const chObj = lastSample.channels[chNum] || lastSample.channels[`ch${chNum}`] || lastSample.channels[String(chNum)];
            const val = typeof chObj === 'number' ? chObj : (chObj?.value);

            if (val !== undefined) {
              recordPoint.channels[`ch${chNum}`] = val;
              hasData = true;
            }
          });
          if (hasData) {
            setRecordedData(prev => [...prev.slice(-10000), recordPoint]);
          }
        }
      }
    };

    const worker = dataWorkerRef.current;
    worker.addEventListener('message', handleMessage);
    return () => worker.removeEventListener('message', handleMessage);
  }, [isRecording, isPausedRecording, recordingChannels, isPaused]);

  // Update recording timer
  useEffect(() => {
    let interval = null
    if (isRecording && !isPausedRecording) {
      interval = setInterval(() => {
        const now = Date.now()
        const elapsed = now - recordingStartTime - totalPausedDuration
        setRecordingTime(Math.floor(elapsed / 1000))
      }, 1000)
    } else if (!isRecording && !isConfirmationPending) {
      setRecordingTime(0)
    }
    return () => clearInterval(interval)
  }, [isRecording, isPausedRecording, recordingStartTime, totalPausedDuration, isConfirmationPending])

  // Process Websocket Data - REMOVED (Handled by DataWorker -> BroadcastChannel -> SignalWorker)


  useEffect(() => {
    setChannelConfig(prev => {
      const next = { ...prev }
      let changed = false
      activeChannels.forEach((chIdx, i) => {
        if (!next[chIdx]) {
          const defaultColor = ['#3b82f6', '#10b981', '#f59e0b', '#a855f7'][i % 4]
          next[chIdx] = { zoom: 1, manualRange: "", timeWindowMs: defaultTimeWindowMs, color: defaultColor, smoothing: true }
          changed = true
        }
      })
      return changed ? next : prev
    })
  }, [activeChannels, defaultTimeWindowMs])

  useEffect(() => {
    if (Object.keys(channelConfig).length > 0) {
      localStorage.setItem('liveViewChannelConfig', JSON.stringify(channelConfig))
    }
  }, [channelConfig])

  const updateChannelConfig = (chIdx, key, value) => {
    setChannelConfig(prev => ({
      ...prev,
      [chIdx]: { ...prev[chIdx], [key]: value }
    }))
  }




  useEffect(() => {
    const now = Date.now()
    // Periodic cleanup of very old annotations (run every 5s)
    const interval = setInterval(() => {
      setAnnotations(prev => prev.filter(a => (Date.now() - a.x) < 30000))
    }, 5000);
    return () => clearInterval(interval);
  }, [])

  const startRecording = () => {
    setRecordedData([])
    setRecordingStartTime(Date.now())
    setTotalPausedDuration(0)
    setIsRecording(true)
    setIsPausedRecording(false)
    setIsConfirmationPending(false)
  }

  const togglePause = () => {
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
    setRecordedData([])
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

      // Group recording channels by sensor type
      const sensorsToRecord = {};
      recordingChannels.forEach(chNum => {
        const sensorType = channelMapping[`ch${chNum}`]?.sensor || 'DATA';
        if (!sensorsToRecord[sensorType]) sensorsToRecord[sensorType] = [];
        sensorsToRecord[sensorType].push(chNum);
      });

      const sensorTypes = Object.keys(sensorsToRecord);
      if (sensorTypes.length === 0) {
        setIsSaving(false);
        setRecordedData([]);
        setIsConfirmationPending(false);
        return;
      }

      const savePromises = sensorTypes.map(async (sensorType) => {
        const channelsForThisSensor = sensorsToRecord[sensorType];
        const filename = `${sensorType}__${day}-${month}-${year}__${hours}-${mins}-${secs}.csv`

        // Filter recordedData to only include channels for THIS sensor
        const filteredData = recordedData.map(point => {
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
      setRecordedData([]);
    } catch (err) {
      console.error('Failed to save multi-sensor session:', err)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="live-view-container">
      <div className="h-[94px] shrink-0" />
      <div className="controls-container flex flex-row justify-between flex-wrap gap-4">
        <div className="flex flex-row gap-4 items-center">
          <div className="record-controls flex items-center gap-2">
            {!isRecording && !isConfirmationPending && (
              <button
                onClick={startRecording}
                disabled={isSaving || recordingChannels.length === 0}
                className="record-btn idle"
              >
                <Radio size={16} />
                <span>REC</span>
              </button>
            )}

            {isRecording && (
              <>
                <button
                  onClick={stopRecording}
                  className="record-btn recording"
                >
                  <Square size={16} fill="currentColor" />
                  <span>STOP ({recordingTime}s)</span>
                </button>

                <button
                  onClick={togglePause}
                  className={`record-btn ${isPausedRecording ? 'idle' : 'paused-btn'}`}
                >
                  {isPausedRecording ? <Play size={16} fill="currentColor" /> : <Pause size={16} fill="currentColor" />}
                  <span>{isPausedRecording ? 'RESUME' : 'PAUSE'}</span>
                </button>
              </>
            )}

            {isConfirmationPending && (
              <div className="confirm-group">
                <span className="text-[10px] font-bold text-muted uppercase tracking-wider mr-2">Keep Session ({recordingTime}s)?</span>
                <button
                  onClick={saveRecording}
                  disabled={isSaving}
                  className="save-btn"
                >
                  <Save size={14} />
                  SAVE
                </button>
                <button
                  onClick={discardRecording}
                  disabled={isSaving}
                  className="discard-btn"
                >
                  <Trash2 size={14} />
                  DISCARD
                </button>
              </div>
            )}

            {isSaving && <div className="saving-indicator ml-2">SAVING...</div>}
          </div>

          <div className="w-[1px] h-6 bg-border mx-1 hidden sm:block" />

          {/* CHANNEL SELECTOR */}
          <div className="flex items-center gap-2 bg-surface/50 p-1 rounded-lg border border-border px-3">
            <span className="text-[10px] font-bold text-muted uppercase tracking-wider">Channels</span>
            <div className="flex gap-1.5">
              {Array.from({ length: numChannels }).map((_, chNum) => {
                const chKey = `ch${chNum}`;
                const isSelected = recordingChannels.includes(chNum);
                const sensor = channelMapping[chKey]?.sensor || '??';

                return (
                  <button
                    key={chKey}
                    onClick={() => {
                      setRecordingChannels(prev =>
                        prev.includes(chNum)
                          ? prev.filter(c => c !== chNum)
                          : [...prev, chNum].sort()
                      )
                    }}
                    className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all border ${isSelected
                      ? 'bg-primary text-white border-primary shadow-sm'
                      : 'bg-bg text-muted border-border hover:text-text'
                      }`}
                  >
                    CH{chNum} ({sensor})
                  </button>
                );
              })}
            </div>
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
            <div className="flex items-center gap-2">
              <span className="text-purple-400 flex items-center gap-1"><Wifi size={16} /> Stream</span>: 
              <span className={wsData?.raw?.stream_name ? "text-emerald-400 font-bold shadow-glow-green" : "text-red-400 font-bold shadow-glow-red"}>
                {wsData?.raw?.stream_name || 'Disconnected'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {Array.from({ length: numChannels }).map((_, chIdx) => {
        // Render all channels up to numChannels (2)
        const isEnabled = channelMapping[`ch${chIdx}`]?.enabled !== false;

        const sensorName = channelMapping[`ch${chIdx}`]?.sensor
        const currentZoom = channelConfig[chIdx]?.zoom || 1
        const currentManual = channelConfig[chIdx]?.manualRange || ""
        const currentTimeWindow = channelConfig[chIdx]?.timeWindowMs || defaultTimeWindowMs
        const currentChColor = channelConfig[chIdx]?.color || ['#3b82f6', '#10b981', '#f59e0b', '#a855f7'][chIdx % 4]
        const currentSmoothing = channelConfig[chIdx]?.smoothing ?? true

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
              channelIndex={chIdx}
              smoothing={currentSmoothing}
              onZoomChange={(z) => { updateChannelConfig(chIdx, 'zoom', z); updateChannelConfig(chIdx, 'manualRange', ""); }}
              onRangeChange={(val) => updateChannelConfig(chIdx, 'manualRange', val)}
              onTimeWindowChange={(val) => updateChannelConfig(chIdx, 'timeWindowMs', val)}
              onColorChange={(val) => updateChannelConfig(chIdx, 'color', val)}
              onSmoothingChange={(val) => updateChannelConfig(chIdx, 'smoothing', val)}
            />
          </div>
        )
      })}
    </div>
  )
}
