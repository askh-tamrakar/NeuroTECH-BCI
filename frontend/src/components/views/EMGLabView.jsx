import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Activity, Heart, Volume2, Swords, Dumbbell, ChevronRight, Music2 } from 'lucide-react'
import RPSGame from './RPSGame'
import MuscleMeter from '../emg/MuscleMeter/MuscleMeter'
import EMGWaveform from '../emg/EMGWaveform/EMGWaveform'
import MuscleSonifier from '../emg/MuscleSonifier/MuscleSonifier'
import ECGWaveform from '../emg/ECGWaveform/ECGWaveform'
import MuscleMelody from '../emg/MuscleMelody/MuscleMelody'
import { CalibrationApi } from '../../services/calibrationApi'
import '../../styles/views/EMGLabView.css'

const TABS = [
  { id: 'rps',      label: 'RPS Game',      icon: Swords,   color: '#ef4444' },
  { id: 'meter',    label: 'Muscle Meter',  icon: Dumbbell, color: '#a855f7' },
  { id: 'waves',    label: 'EMG Waves',     icon: Activity, color: '#3b82f6' },
  { id: 'sound',    label: 'Muscle Sound',  icon: Volume2,  color: '#22c55e' },
  { id: 'melody',   label: 'Muscle Melody', icon: Music2,   color: '#f59e0b' },
  { id: 'ecg',      label: 'ECG / Heart',   icon: Heart,    color: '#ef4444' },
]

export default function EMGLabView({ wsEvent, wsMessage }) {
  const [activeTab, setActiveTab] = useState('rps')

  // Shared RMS ring-buffer — updated from emg_prediction events
  const rmsHistoryRef = useRef(new Float32Array(512).fill(0))
  const rmsHeadRef    = useRef(0)
  const latestRmsRef  = useRef(0)
  const latestLabelRef = useRef('Rest')

  // ECG data buffer — updated from ecg_prediction events
  const ecgHistoryRef = useRef(new Float32Array(1024).fill(0))
  const ecgHeadRef    = useRef(0)
  const latestBpmRef  = useRef(null)
  const ecgMetaRef    = useRef({ bpm: null, rr_ms: null, rr_sdnn: null, signal_quality: 0 })

  // Activate EMG prediction on mount (ECG tab will also activate ECG via its own effect)
  useEffect(() => {
    CalibrationApi.togglePrediction('EMG', true).catch(() => {})
    CalibrationApi.togglePrediction('ECG', true).catch(() => {})
    return () => {
      CalibrationApi.togglePrediction('EMG', false).catch(() => {})
      CalibrationApi.togglePrediction('ECG', false).catch(() => {})
    }
  }, [])

  // Process incoming websocket events once, share via refs
  useEffect(() => {
    if (!wsEvent) return
    const ev = wsEvent

    if (ev.event === 'emg_prediction' || ev.type === 'emg_prediction') {
      const rms = ev.features?.rms ?? ev.rms ?? 0
      latestRmsRef.current = rms
      latestLabelRef.current = ev.label ?? ev.features?.label ?? 'Rest'
      const buf = rmsHistoryRef.current
      buf[rmsHeadRef.current % buf.length] = rms
      rmsHeadRef.current++
    }

    if (ev.event === 'ecg_prediction' || ev.type === 'ecg_prediction') {
      const f = ev.features ?? {}
      ecgMetaRef.current = {
        bpm:            f.bpm            ?? ecgMetaRef.current.bpm,
        rr_ms:          f.rr_ms          ?? ecgMetaRef.current.rr_ms,
        rr_sdnn:        f.rr_sdnn        ?? ecgMetaRef.current.rr_sdnn,
        signal_quality: f.signal_quality ?? ecgMetaRef.current.signal_quality,
      }
    }
  }, [wsEvent])

  return (
    <div className="emglab-root">
      {/* Tab bar — always visible for navigation */}
      <div className="emglab-tabbar">
        {TABS.map(tab => {
          const Icon = tab.icon
          const active = activeTab === tab.id
          return (
            <button
              key={tab.id}
              className={`emglab-tab ${active ? 'active' : ''}`}
              style={active ? { '--tab-color': tab.color } : {}}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={16} />
              <span>{tab.label}</span>
              {active && <ChevronRight size={12} className="emglab-tab-arrow" />}
            </button>
          )
        })}
      </div>

      {/* Panels — all kept mounted so state / canvas live on */}
      <div className="emglab-panels">
        <div className={`emglab-panel ${activeTab === 'rps'    ? 'visible' : ''}`}>
          <RPSGame wsEvent={wsEvent} />
        </div>
        <div className={`emglab-panel ${activeTab === 'meter'  ? 'visible' : ''}`}>
          <MuscleMeter
            rmsHistoryRef={rmsHistoryRef}
            rmsHeadRef={rmsHeadRef}
            latestRmsRef={latestRmsRef}
            latestLabelRef={latestLabelRef}
            wsEvent={wsEvent}
            wsMessage={wsMessage}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            tabs={TABS}
          />
        </div>
        <div className={`emglab-panel ${activeTab === 'waves'  ? 'visible' : ''}`}>
          <EMGWaveform
            rmsHistoryRef={rmsHistoryRef}
            rmsHeadRef={rmsHeadRef}
            latestRmsRef={latestRmsRef}
            wsEvent={wsEvent}
          />
        </div>
        <div className={`emglab-panel ${activeTab === 'sound'  ? 'visible' : ''}`}>
          <MuscleSonifier
            latestRmsRef={latestRmsRef}
            wsEvent={wsEvent}
          />
        </div>
        <div className={`emglab-panel ${activeTab === 'melody' ? 'visible' : ''}`}>
          <MuscleMelody
            wsEvent={wsEvent}
            activeTab={activeTab}
          />
        </div>
        <div className={`emglab-panel ${activeTab === 'ecg'    ? 'visible' : ''}`}>
          <ECGWaveform
            ecgHistoryRef={ecgHistoryRef}
            ecgHeadRef={ecgHeadRef}
            ecgMetaRef={ecgMetaRef}
            wsEvent={wsEvent}
            wsMessage={wsMessage}
          />
        </div>
      </div>
    </div>
  )
}
