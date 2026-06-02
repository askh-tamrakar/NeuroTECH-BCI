import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Volume2, VolumeX, Mic } from 'lucide-react'
import './MuscleSonifier.css'

const WAVEFORMS = ['sine', 'sawtooth', 'square', 'triangle']
const BASE_FREQ  = 80    // Hz at zero activation
const MAX_FREQ   = 800   // Hz at full activation
const EMA_ALPHA  = 0.15

export default function MuscleSonifier({ latestRmsRef, wsEvent }) {
  const [active,    setActive]    = useState(false)
  const [waveform,  setWaveform]  = useState('sawtooth')
  const [volume,    setVolume]    = useState(0.4)
  const [mvcRef,    setMvcRef]    = useState(null)   // normalisation ceiling
  const [freqNow,   setFreqNow]   = useState(BASE_FREQ)

  // Web Audio refs — never recreated after first init
  const ctxRef   = useRef(null)
  const oscRef   = useRef(null)
  const gainRef  = useRef(null)
  const analyserRef = useRef(null)
  const smoothRms   = useRef(0)

  // Oscilloscope canvas
  const scopeRef = useRef(null)
  const scopeRaf = useRef(null)

  // ── Build / tear-down audio graph ───────────────────────────────────
  const startAudio = useCallback(() => {
    if (ctxRef.current) return
    const ctx  = new (window.AudioContext || window.webkitAudioContext)()
    const osc  = ctx.createOscillator()
    const gain = ctx.createGain()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 1024

    osc.type = waveform
    osc.frequency.value = BASE_FREQ
    gain.gain.value = 0

    osc.connect(gain)
    gain.connect(analyser)
    analyser.connect(ctx.destination)
    osc.start()

    ctxRef.current    = ctx
    oscRef.current    = osc
    gainRef.current   = gain
    analyserRef.current = analyser
  }, [waveform])

  const stopAudio = useCallback(() => {
    try { oscRef.current?.stop() } catch {}
    ctxRef.current?.close()
    ctxRef.current = null; oscRef.current = null; gainRef.current = null; analyserRef.current = null
  }, [])

  useEffect(() => {
    return () => stopAudio()
  }, [stopAudio])

  // ── Toggle active ────────────────────────────────────────────────────
  const toggle = () => {
    if (active) {
      stopAudio()
      setActive(false)
      cancelAnimationFrame(scopeRaf.current)
    } else {
      startAudio()
      setActive(true)
    }
  }

  // ── Update waveform type live ────────────────────────────────────────
  useEffect(() => {
    if (oscRef.current) oscRef.current.type = waveform
  }, [waveform])

  // ── Modulate pitch & gain from RMS ──────────────────────────────────
  useEffect(() => {
    if (!wsEvent || (wsEvent.event !== 'emg_prediction' && wsEvent.type !== 'emg_prediction')) return
    const rms    = wsEvent.features?.rms ?? wsEvent.rms ?? 0
    smoothRms.current = smoothRms.current + EMA_ALPHA * (rms - smoothRms.current)
    const ceil   = mvcRef ?? Math.max(rms * 2, 50)
    const pct    = Math.min(smoothRms.current / ceil, 1)
    const freq   = BASE_FREQ + pct * (MAX_FREQ - BASE_FREQ)
    setFreqNow(Math.round(freq))

    if (oscRef.current  && active) {
      oscRef.current.frequency.setTargetAtTime(freq, ctxRef.current.currentTime, 0.05)
    }
    if (gainRef.current && active) {
      const g = pct > 0.01 ? volume : 0
      gainRef.current.gain.setTargetAtTime(g, ctxRef.current.currentTime, 0.05)
    }
  }, [wsEvent, active, volume, mvcRef])

  // ── Volume knob ──────────────────────────────────────────────────────
  useEffect(() => {
    if (gainRef.current && active && ctxRef.current) {
      gainRef.current.gain.setTargetAtTime(volume, ctxRef.current.currentTime, 0.05)
    }
  }, [volume, active])

  // ── Oscilloscope ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!active) return
    const canvas = scopeRef.current
    if (!canvas) return

    function scopeDraw() {
      const analyser = analyserRef.current
      if (!analyser || !canvas) return
      const ctx  = canvas.getContext('2d')
      const W = canvas.width, H = canvas.height
      const buf = new Uint8Array(analyser.frequencyBinCount)
      analyser.getByteTimeDomainData(buf)

      ctx.clearRect(0, 0, W, H)

      // Background
      ctx.fillStyle = 'rgba(0,0,0,0.6)'
      ctx.fillRect(0, 0, W, H)

      // Grid centre line
      ctx.strokeStyle = 'rgba(255,255,255,0.05)'
      ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(0, H/2); ctx.lineTo(W, H/2); ctx.stroke()

      // Waveform
      ctx.strokeStyle = '#22c55e'
      ctx.shadowColor = '#22c55e'
      ctx.shadowBlur  = 6
      ctx.lineWidth   = 2
      ctx.beginPath()
      const sliceW = W / buf.length
      buf.forEach((v, i) => {
        const x = i * sliceW
        const y = (v / 128) * (H / 2)
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      })
      ctx.stroke()
      ctx.shadowBlur = 0

      scopeRaf.current = requestAnimationFrame(scopeDraw)
    }
    scopeRaf.current = requestAnimationFrame(scopeDraw)
    return () => cancelAnimationFrame(scopeRaf.current)
  }, [active])

  // Resize scope canvas
  useEffect(() => {
    const canvas = scopeRef.current
    if (!canvas) return
    const ro = new ResizeObserver(() => {
      canvas.width  = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
    })
    ro.observe(canvas)
    canvas.width  = canvas.offsetWidth
    canvas.height = canvas.offsetHeight
    return () => ro.disconnect()
  }, [])

  const calibrateMvc = () => {
    setMvcRef(latestRmsRef.current > 0 ? latestRmsRef.current * 1.2 : null)
  }

  return (
    <div className="ms-root">
      {/* Oscilloscope canvas */}
      <div className="ms-scope-wrap">
        <canvas ref={scopeRef} className="ms-scope" />
        {!active && (
          <div className="ms-scope-placeholder">
            <Mic size={36} />
            <span>Press START to hear your muscles</span>
          </div>
        )}
      </div>

      {/* Freq + vol display */}
      <div className="ms-display">
        <div className="lab-stat">
          <span className="lab-stat-label">Frequency</span>
          <span className="lab-stat-value" style={{ color: '#22c55e', fontSize: '2rem' }}>
            {freqNow} Hz
          </span>
        </div>
        <div className="ms-divider" />
        <div className="lab-stat">
          <span className="lab-stat-label">Waveform</span>
          <div className="ms-waveform-row">
            {WAVEFORMS.map(w => (
              <button
                key={w}
                className={`ms-wave-btn ${waveform === w ? 'active' : ''}`}
                onClick={() => setWaveform(w)}
              >
                {w}
              </button>
            ))}
          </div>
        </div>
        <div className="ms-divider" />
        <div className="lab-stat">
          <span className="lab-stat-label">Volume</span>
          <input
            type="range" min="0" max="1" step="0.02"
            value={volume}
            onChange={e => setVolume(Number(e.target.value))}
            className="ms-volume-slider"
          />
          <span className="lab-stat-value" style={{ fontSize: '0.9rem' }}>{Math.round(volume * 100)}%</span>
        </div>
      </div>

      {/* Controls */}
      <div className="ms-controls">
        <button className={`ms-start-btn ${active ? 'active' : ''}`} onClick={toggle}>
          {active ? <VolumeX size={18} /> : <Volume2 size={18} />}
          {active ? 'Stop' : 'Start'}
        </button>
        <button className="ms-btn" onClick={calibrateMvc} title="Set current RMS as ceiling for pitch mapping">
          Set Ceiling
        </button>
      </div>
    </div>
  )
}
