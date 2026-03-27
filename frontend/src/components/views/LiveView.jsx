import React, { useState, useEffect, useRef, useMemo } from 'react'
import SignalChart from '../charts/SignalChart'
import { Radio, Square, Play, Pause, Save, Trash2, Cpu, Settings2, Wifi, Power } from 'lucide-react'
import { CalibrationApi } from '../../services/calibrationApi'
import '../../styles/live/LiveView.css'

export default function LiveView({ wsData, wsEvent, config, isPaused, wsUrl, recordState, recordHandlers }) {
  const defaultTimeWindowMs = config?.display?.timeWindowMs || 10000
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

  const [annotations, setAnnotations] = useState([])
  const [allDetectionActive, setAllDetectionActive] = useState(false)

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
        if (payload.event === 'SingleBlink' || payload.event === 'DoubleBlink') {
          const ts = Date.now();
          setAnnotations(prev => [
            ...prev,
            { x: ts, label: payload.event === 'DoubleBlink' ? 'DBL-BLINK' : 'BLINK', color: '#ef4444', channel: payload.channel }
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

  // Sync Pause State to DataWorker (so it stops processing/broadcasting)
  useEffect(() => {
    if (dataWorkerRef.current) {
      dataWorkerRef.current.postMessage({ type: 'SET_PAUSED', payload: isPaused });
    }
  }, [isPaused]);


  // Recording Logic - separate effect that listens to the existing worker
  useEffect(() => {
    if (!dataWorkerRef.current || !recordState?.isRecording || recordState?.isPausedRecording) return;

    const handleMessage = (e) => {
      const { type, payload } = e.data;
      if (type === 'RECORD_BATCH') {
        const { samples } = payload;
        if (samples && recordState?.recordedDataRef) {
          samples.forEach(sample => {
            const recordPoint = { timestamp: sample.timestamp, channels: {} };
            let hasData = false;
            recordState.recordingChannels.forEach(chNum => {
              const chObj = sample.channels[chNum] || sample.channels[`ch${chNum}`] || sample.channels[String(chNum)];
              const val = typeof chObj === 'number' ? chObj : (chObj?.value);

              if (val !== undefined) {
                recordPoint.channels[`ch${chNum}`] = val;
                hasData = true;
              }
            });
            if (hasData) {
              recordState.recordedDataRef.current.push(recordPoint);
            }
          });
          
          // Cap recording point memory to prevent extreme memory bloat (~20 mins at 1000Hz = 1.2M points)
          if (recordState.recordedDataRef.current.length > 1500000) {
            recordState.recordedDataRef.current = recordState.recordedDataRef.current.slice(-1500000);
          }
        }
      }
    };

    const worker = dataWorkerRef.current;
    worker.addEventListener('message', handleMessage);
    return () => worker.removeEventListener('message', handleMessage);
  }, [recordState?.isRecording, recordState?.isPausedRecording, recordState?.recordingChannels]);
  // Process Websocket Data - REMOVED (Handled by DataWorker -> BroadcastChannel -> SignalWorker)


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

  useEffect(() => {
    return () => {
      CalibrationApi.togglePrediction('ALL', false).catch(() => { })
    }
  }, [])

  // (Recording action handlers moved to LiveDashboard.jsx)

  return (
    <div className="live-view-container !pt-[94px] !pb-[35px]">
      {/* Top Controls Bar - Desktop Only */}
      <div className="controls-container hidden lg:flex ml-4 mr-4 mt-4 items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="record-controls flex items-center gap-2">
            {!recordState?.isRecording && !recordState?.isConfirmationPending && (
              <button
                onClick={recordHandlers?.startRecording}
                disabled={recordState?.isSaving || recordState?.recordingChannels?.length === 0}
                className="record-btn idle flex items-center gap-1"
              >
                <Radio size={22} />
                <span className='text-[16px]'>REC</span>
              </button>
            )}

            {recordState?.isRecording && (
              <>
                <button
                  onClick={recordHandlers?.stopRecording}
                  className="record-btn recording flex items-center gap-1"
                >
                  <Square size={22} fill="currentColor" />
                  <span className='text-[16px]'>STOP ({recordState?.recordingTime}s)</span>
                </button>

                <button
                  onClick={recordHandlers?.togglePauseRecording}
                  className={`record-btn flex items-center gap-1 ${recordState?.isPausedRecording ? 'idle' : 'paused-btn'}`}
                >
                  {recordState?.isPausedRecording ? <Play size={22} fill="currentColor" /> : <Pause size={22} fill="currentColor" />}
                  <span className='text-[16px]'>{recordState?.isPausedRecording ? 'RESUME' : 'PAUSE'}</span>
                </button>
              </>
            )}

            {recordState?.isConfirmationPending && (
              <div className="confirm-group flex items-center gap-2">
                <span className="text-[14px] font-bold text-muted uppercase tracking-wider mr-2">Keep Session ({recordState?.recordingTime}s)?</span>
                <button
                  onClick={recordHandlers?.saveRecording}
                  disabled={recordState?.isSaving}
                  className="save-btn flex items-center gap-1"
                >
                  <Save size={18} />
                  <span className='text-[12px]'>SAVE</span>
                </button>
                <button
                  onClick={recordHandlers?.discardRecording}
                  disabled={recordState?.isSaving}
                  className="discard-btn flex items-center gap-1"
                >
                  <Trash2 size={18} />
                  <span className='text-[12px]'>DISCARD</span>
                </button>
              </div>
            )}

            {recordState?.isSaving && <div className="saving-indicator ml-2 text-primary font-bold">SAVING...</div>}
          </div>

          <div className="w-[2px] h-6 bg-border" />

          {/* CHANNEL SELECTOR */}
          <div className="flex items-center gap-2 bg-surface/50 p-1 rounded-lg border border-border px-3">
            <span className="text-[14px] font-bold text-muted uppercase tracking-wider">Channels</span>
            <div className="flex gap-1.5">
              {Array.from({ length: numChannels }).map((_, chNum) => {
                const chKey = `ch${chNum}`;
                const isSelected = recordState?.recordingChannels?.includes(chNum);
                const sensor = channelMapping[chKey]?.sensor || '??';

                return (
                  <button
                    key={chKey}
                    onClick={() => {
                      recordHandlers?.setRecordingChannels(prev =>
                        prev.includes(chNum)
                          ? prev.filter(c => c !== chNum)
                          : [...prev, chNum].sort()
                      )
                    }}
                    className={`px-2 py-0.5 rounded text-[12px] font-bold transition-all border ${isSelected
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

          <div className="w-[2px] h-6 bg-border" />

          <button
            onClick={() => recordHandlers?.setIsFirmwareModalOpen(true)}
            className="px-3 py-1.5 bg-bg/50 border border-border rounded-lg text-[14px] font-bold text-muted hover:text-text hover:bg-surface/50 transition-all flex items-center gap-2"
            title="Download Firmware"
          >
            <Cpu size={20} className="text-primary" />
            FIRMWARE
          </button>

          <button
            onClick={async () => {
              const nextState = !allDetectionActive
              try {
                await CalibrationApi.togglePrediction('ALL', nextState)
                setAllDetectionActive(nextState)
              } catch (error) {
                console.error('Failed to toggle all detection:', error)
              }
            }}
            className={`px-3 py-1.5 rounded-lg text-[14px] font-bold transition-all flex items-center gap-2 border ${allDetectionActive
              ? 'bg-primary text-white border-primary shadow-sm'
              : 'bg-bg/50 border-border text-muted hover:text-text hover:bg-surface/50'
              }`}
            title="Start or stop EMG, EOG, and EEG detection together"
          >
            <Power size={18} />
            {allDetectionActive ? 'STOP ALL DETECTION' : 'START ALL DETECTION'}
          </button>

          <div>
            {recordState?.isRecording && <div className="recording-status font-bold text-red-500 animate-pulse"> ● RECORDING </div>}
          </div>
        </div>

        <div className="flex flex-row gap-2 shrink-0">
          <div className="mode-indicator px-4 py-2 bg-surface/80 rounded-xl border border-border flex items-center gap-4">
            <span className="text-[16px] text-primary font-bold flex items-center gap-2 w-auto"><Settings2 size={22} /> MODE:</span>
            <span className="text-text font-bold tracking-wider text-sm">INDEPENDENT SCALING</span>
            <div className="w-[2px] h-6 bg-border mx-2" />
            <div className="flex items-center gap-2 text-muted font-bold text-sm"><span className="text-[16px] text-purple-400 flex items-center gap-1"><Wifi size={22} /> Stream</span>: <span className="text-text">{wsData?.raw?.stream_name || 'Disconnected'}</span></div>
          </div>
        </div>
      </div>

      <div className="graphs-grid-container grid gap-4 grid-cols-1 p-4 pt-2 h-full min-h-0">
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
            <div key={chIdx} className="channel-wrapper h-full min-h-[300px]">
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
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
