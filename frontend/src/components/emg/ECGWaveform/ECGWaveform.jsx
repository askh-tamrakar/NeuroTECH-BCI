import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Pause, Play, Download, ZoomIn, ZoomOut, Volume2, VolumeX } from 'lucide-react'
import { useHeartbeatAudio } from '../../../hooks/useHeartbeatAudio'
import './ECGWaveform.css'

const WINDOW_SECS  = 8
const HISTORY_PTS  = 4096
const GAIN_PRESETS = [0.5, 1, 2, 4]
const YRANGE_DEFAULT = 60  // fixed baseline y-range (grows with signal, never shrinks)

// BPM → heart zone colour
function bpmColor(bpm) {
  if (!bpm) return 'var(--muted)'
  if (bpm < 60)  return '#3b82f6'   // Bradycardia
  if (bpm < 100) return '#22c55e'   // Normal
  return '#ef4444'                  // Tachycardia
}
function bpmZone(bpm) {
  if (!bpm) return 'NO SIGNAL'
  if (bpm < 60)  return 'BRADYCARDIA'
  if (bpm < 100) return 'NORMAL'
  return 'TACHYCARDIA'
}

// HRV quality badge
function hrvBadge(sdnn) {
  if (!sdnn) return { label: '—', color: 'var(--muted)' }
  if (sdnn < 20) return { label: 'STRESSED',  color: '#ef4444' }
  if (sdnn < 50) return { label: 'BALANCED',  color: '#f59e0b' }
  return                { label: 'RELAXED',   color: '#22c55e' }
}

export default function ECGWaveform({ ecgHistoryRef, ecgHeadRef, ecgMetaRef, wsEvent, wsMessage }) {
  const canvasRef = useRef(null)
  const rafRef    = useRef(null)
  const ptsRef    = useRef([])      // { t, value }

  const [paused, setPaused] = useState(false)
  const [gainIdx, setGainIdx] = useState(1)   // index into GAIN_PRESETS
  const [meta, setMeta]       = useState({ bpm: null, rr_ms: null, rr_sdnn: null, signal_quality: 0 })
  const [soundOn, setSoundOn] = useState(true)

  const yRangeBaseRef = useRef(YRANGE_DEFAULT)
  const beatTimerRef  = useRef(null)

  const { playBeat, prime } = useHeartbeatAudio(0.65)

  // ── Ingest ecg_prediction events (metadata only) ───────────────────
  useEffect(() => {
    if (!wsEvent || paused) return

    if (wsEvent.event === 'ecg_prediction' || wsEvent.type === 'ecg_prediction') {
      const f = wsEvent.features ?? {}
      setMeta({
        bpm:            f.bpm            ?? null,
        rr_ms:          f.rr_ms          ?? null,
        rr_sdnn:        f.rr_sdnn        ?? null,
        signal_quality: f.signal_quality ?? 0,
      })
    }
  }, [wsEvent, paused])

  // ── Ingest real ECG waveform from bio_data_batch ──────────────────
  useEffect(() => {
    if (!wsMessage || paused) return
    const batch = wsMessage.raw?._batch
    if (!batch?.length) return
    const sr = wsMessage.raw?.sample_rate || 512
    const now = Date.now()
    const batchDurationMs = (batch.length / sr) * 1000
    const batchStartMs = now - batchDurationMs

    batch.forEach((sample, i) => {
      const t = batchStartMs + (i / batch.length) * batchDurationMs
      const channels = sample.channels || {}
      for (const chData of Object.values(channels)) {
        if ((chData.type || '').toUpperCase() === 'ECG') {
          ptsRef.current.push({ t, value: chData.value })
          break
        }
      }
    })
    if (ptsRef.current.length > HISTORY_PTS) {
      ptsRef.current = ptsRef.current.slice(-HISTORY_PTS)
    }
  }, [wsMessage, paused])

  // ── Continuous heartbeat sound loop — rate follows BPM ──────────────
  useEffect(() => {
    if (beatTimerRef.current) {
      clearInterval(beatTimerRef.current)
      beatTimerRef.current = null
    }
    if (!paused && soundOn && meta.bpm && meta.bpm > 0) {
      const intervalMs = Math.max(300, Math.min(2000, 60000 / meta.bpm))
      beatTimerRef.current = setInterval(() => playBeat(), intervalMs)
    }
    return () => {
      if (beatTimerRef.current) { clearInterval(beatTimerRef.current); beatTimerRef.current = null }
    }
  }, [meta.bpm, paused, soundOn, playBeat])
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) { rafRef.current = requestAnimationFrame(draw); return }
    const ctx = canvas.getContext('2d')
    const W = canvas.width, H = canvas.height

    ctx.clearRect(0, 0, W, H)

    const now  = Date.now()
    const tMin = now - WINDOW_SECS * 1000
    const gain = GAIN_PRESETS[gainIdx]
    const pts  = ptsRef.current.filter(p => p.t >= tMin)

    // Static y-range: grows to accommodate max seen signal, never shrinks
    if (pts.length > 0) {
      const rawMax = Math.max(...pts.map(p => Math.abs(p.value)), 1)
      yRangeBaseRef.current = Math.max(yRangeBaseRef.current, rawMax * 1.15)
    }
    const yRange = Math.max(yRangeBaseRef.current, YRANGE_DEFAULT) * (1 / gain)

    const toPx = (t) => ((t - tMin) / (WINDOW_SECS * 1000)) * W
    const toY  = (v) => H / 2 - (v * gain / yRange) * (H / 2 - 10)

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.05)'
    ctx.lineWidth = 1
    for (let s = 0; s <= WINDOW_SECS; s++) {
      const x = (s / WINDOW_SECS) * W
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke()
    }
    for (let row = 1; row < 4; row++) {
      const y = (row / 4) * H
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
    }
    // Baseline
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 4])
    ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke()
    ctx.setLineDash([])

    if (pts.length < 2) { rafRef.current = requestAnimationFrame(draw); return }

    // ECG trace
    const color = bpmColor(meta.bpm)
    ctx.strokeStyle = color
    ctx.shadowColor = color
    ctx.shadowBlur  = 7
    ctx.lineWidth   = 2
    ctx.lineJoin    = 'round'
    ctx.beginPath()
    pts.forEach((p, i) => {
      const x = toPx(p.t), y = toY(p.value)
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    })
    ctx.stroke()
    ctx.shadowBlur = 0

    rafRef.current = requestAnimationFrame(draw)
  }, [gainIdx, meta.bpm])

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw])

  // Resize
  useEffect(() => {
    const canvas = canvasRef.current
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

  const exportPng = () => {
    const a = document.createElement('a')
    a.download = `ecg_${Date.now()}.png`
    a.href = canvasRef.current.toDataURL()
    a.click()
  }

  const hrv = hrvBadge(meta.rr_sdnn)
  const bColor = bpmColor(meta.bpm)

  return (
    <div className="ecgw-root" onPointerDown={prime}>
      {/* Canvas + stats layout */}
      <div className="ecgw-body">
        {/* ── Waveform canvas ── */}
        <div className="ecgw-canvas-wrap">
          <canvas ref={canvasRef} className="ecgw-canvas" />
          {paused && <div className="ecgw-badge">PAUSED</div>}
          {/* Gain label */}
          <div className="ecgw-gain-label">×{GAIN_PRESETS[gainIdx]}</div>
        </div>

        {/* ── Stats panel ── */}
        <div className="ecgw-stats">
          {/* BPM big display */}
          <div className="ecgw-bpm-block" style={{ '--bpm-color': bColor }}>
            <span className="ecgw-bpm-num" style={{ color: bColor }}>
              {meta.bpm != null ? Math.round(meta.bpm) : '—'}
            </span>
            <span className="ecgw-bpm-unit">BPM</span>
            <span className="ecgw-bpm-zone" style={{ color: bColor }}>{bpmZone(meta.bpm)}</span>
          </div>

          {/* Heart pulse animation */}
          <div className="ecgw-pulse" style={{ '--pulse-color': bColor }}>
            <svg viewBox="0 0 24 24" className="ecgw-heart" fill={bColor}>
              <path d="M12 21.593c-5.63-5.539-11-10.297-11-14.402 0-3.791 3.068-5.191 5.281-5.191 1.312 0 4.151.501 5.719 4.457 1.59-3.968 4.464-4.447 5.726-4.447 2.54 0 5.274 1.621 5.274 5.181 0 4.069-5.136 8.625-11 14.402z"/>
            </svg>
          </div>

          <div className="ecgw-divider" />

          {/* RR + HRV */}
          <div className="lab-stat">
            <span className="lab-stat-label">RR Interval</span>
            <span className="lab-stat-value">{meta.rr_ms != null ? `${Math.round(meta.rr_ms)} ms` : '—'}</span>
          </div>

          <div className="lab-stat">
            <span className="lab-stat-label">HRV (SDNN)</span>
            <span className="lab-stat-value" style={{ color: hrv.color }}>
              {meta.rr_sdnn != null ? `${Math.round(meta.rr_sdnn)} ms` : '—'}
            </span>
            <span className="ecgw-hrv-badge" style={{ color: hrv.color }}>{hrv.label}</span>
          </div>

          <div className="lab-stat">
            <span className="lab-stat-label">Signal</span>
            <div className="ecgw-quality-bar">
              <div
                className="ecgw-quality-fill"
                style={{
                  width: `${(meta.signal_quality ?? 0) * 100}%`,
                  background: (meta.signal_quality ?? 0) > 0.6 ? '#22c55e' : '#f59e0b',
                }}
              />
            </div>
            <span className="lab-stat-value" style={{ fontSize: '0.8rem' }}>
              {(meta.signal_quality ?? 0) > 0.6 ? 'Good' : (meta.signal_quality ?? 0) > 0.3 ? 'Fair' : 'Poor'}
            </span>
          </div>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="ecgw-toolbar">
        <button className="emgw-btn" onClick={() => setPaused(p => !p)}>
          {paused ? <Play size={14} /> : <Pause size={14} />}
          {paused ? 'Resume' : 'Pause'}
        </button>
        <div className="ecgw-gain-row">
          <span className="lab-stat-label">Gain</span>
          <button className="emgw-btn" onClick={() => setGainIdx(i => Math.max(0, i - 1))} disabled={gainIdx === 0}>
            <ZoomOut size={14} />
          </button>
          <span className="ecgw-gain-val">×{GAIN_PRESETS[gainIdx]}</span>
          <button className="emgw-btn" onClick={() => setGainIdx(i => Math.min(GAIN_PRESETS.length - 1, i + 1))} disabled={gainIdx === GAIN_PRESETS.length - 1}>
            <ZoomIn size={14} />
          </button>
        </div>
        <button className="emgw-btn" onClick={() => { ptsRef.current = []; yRangeBaseRef.current = YRANGE_DEFAULT }}>
          Clear
        </button>
        <button className="emgw-btn" onClick={exportPng}>
          <Download size={14} /> PNG
        </button>
        <button className="emgw-btn" onClick={() => { setSoundOn(s => !s); if (!soundOn && meta.bpm) playBeat() }} title={soundOn ? 'Mute heartbeat' : 'Unmute heartbeat'}>
          {soundOn ? <Volume2 size={14} /> : <VolumeX size={14} />}
        </button>
      </div>
    </div>
  )
}
