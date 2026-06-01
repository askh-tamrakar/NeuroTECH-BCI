import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Play, Pause, Trash2, Download } from 'lucide-react'
import './EMGWaveform.css'

const WINDOW_SECS  = 6        // visible seconds
const HISTORY_PTS  = 3000     // ring-buffer capacity
const EMA_ALPHA    = 0.08     // smoothed trace alpha
const THRESHOLD_DEFAULT = 50  // µV default threshold

export default function EMGWaveform({ rmsHistoryRef, rmsHeadRef, latestRmsRef, wsEvent }) {
  const canvasRef  = useRef(null)
  const rafRef     = useRef(null)
  const ptsRef     = useRef([])          // { t, raw, smooth }
  const smoothRef  = useRef(0)
  const lastTsRef  = useRef(null)
  const gestureRef = useRef([])          // { t, label }

  const [paused,    setPaused]    = useState(false)
  const [showSmooth,setShowSmooth]= useState(true)
  const [threshold, setThreshold] = useState(THRESHOLD_DEFAULT)
  const [stats,     setStats]     = useState({ mean: 0, peak: 0 })
  const maxSeenRef   = useRef(0)
  const statsTimerRef = useRef(0)

  // ── Ingest new RMS from wsEvent ─────────────────────────────────────
  useEffect(() => {
    if (!wsEvent || paused) return

    if (wsEvent.event === 'emg_prediction' || wsEvent.type === 'emg_prediction') {
      const rms = wsEvent.features?.rms ?? wsEvent.rms ?? 0
      smoothRef.current = smoothRef.current + EMA_ALPHA * (rms - smoothRef.current)
      const t = Date.now()
      const pts = ptsRef.current
      pts.push({ t, raw: rms, smooth: smoothRef.current })
      if (pts.length > HISTORY_PTS) pts.splice(0, pts.length - HISTORY_PTS)

      if (wsEvent.label && wsEvent.label !== 'Rest') {
        gestureRef.current.push({ t, label: wsEvent.label })
        if (gestureRef.current.length > 40) gestureRef.current.shift()
      }

      maxSeenRef.current = Math.max(maxSeenRef.current, rms)
    }
  }, [wsEvent, paused])

  // ── Canvas draw loop ────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const W = canvas.width, H = canvas.height

    ctx.clearRect(0, 0, W, H)

    const now   = Date.now()
    const tMin  = now - WINDOW_SECS * 1000
    const pts   = ptsRef.current.filter(p => p.t >= tMin)
    const yRange= Math.max(threshold * 2.5, maxSeenRef.current * 1.2, 10)

    const toPx = (t) => ((t - tMin) / (WINDOW_SECS * 1000)) * W
    const toY  = (v) => H - 8 - (Math.min(v, yRange) / yRange) * (H - 16)

    // Grid
    ctx.strokeStyle = getComputedStyle(canvas).getPropertyValue('--border').trim() || 'rgba(255,255,255,0.08)'
    ctx.lineWidth = 1
    for (let s = 0; s <= WINDOW_SECS; s++) {
      const x = (s / WINDOW_SECS) * W
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke()
    }
    for (let row = 0; row <= 4; row++) {
      const y = (row / 4) * H
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
    }

    // Threshold line
    const thY = toY(threshold)
    ctx.setLineDash([6, 4])
    ctx.strokeStyle = 'rgba(239,68,68,0.5)'
    ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(0, thY); ctx.lineTo(W, thY); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = 'rgba(239,68,68,0.7)'
    ctx.font = '10px monospace'
    ctx.fillText(`${threshold} µV`, 4, thY - 3)

    if (pts.length < 2) { rafRef.current = requestAnimationFrame(draw); return }

    // Raw trace
    ctx.strokeStyle = 'rgba(59,130,246,0.6)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    pts.forEach((p, i) => {
      const x = toPx(p.t), y = toY(p.raw)
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    })
    ctx.stroke()

    // Smoothed trace
    if (showSmooth) {
      ctx.strokeStyle = '#3b82f6'
      ctx.lineWidth = 2.5
      ctx.shadowColor = '#3b82f6'
      ctx.shadowBlur  = 6
      ctx.beginPath()
      pts.forEach((p, i) => {
        const x = toPx(p.t), y = toY(p.smooth)
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      })
      ctx.stroke()
      ctx.shadowBlur = 0
    }

    // Gesture labels
    const cutGesture = now - WINDOW_SECS * 1000
    gestureRef.current = gestureRef.current.filter(g => g.t >= cutGesture)
    gestureRef.current.forEach(g => {
      const x = toPx(g.t)
      ctx.strokeStyle = 'rgba(168,85,247,0.7)'
      ctx.lineWidth   = 1.5
      ctx.setLineDash([3, 3])
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle   = '#a855f7'
      ctx.font        = 'bold 11px monospace'
      ctx.fillText(g.label, Math.min(x + 3, W - 60), 16)
    })

    // Stats update throttled to ~4 Hz (every 250ms)
    const nowStats = performance.now()
    if (pts.length > 0 && nowStats - statsTimerRef.current > 250) {
      statsTimerRef.current = nowStats
      const vals = pts.map(p => p.raw)
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length
      const peak = Math.max(...vals)
      setStats({ mean: mean.toFixed(1), peak: peak.toFixed(1) })
    }

    rafRef.current = requestAnimationFrame(draw)
  }, [showSmooth, threshold])

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw])

  // Resize canvas — also re-check on visibility change (tab switch)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const sync = () => {
      const w = canvas.offsetWidth
      const h = canvas.offsetHeight
      if (w > 0 && h > 0) {
        canvas.width  = w
        canvas.height = h
      }
    }
    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(canvas)
    // Re-measure when the panel becomes visible (tab switch)
    const visObserver = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) sync()
    })
    visObserver.observe(canvas)
    return () => { ro.disconnect(); visObserver.disconnect() }
  }, [])

  const exportPng = () => {
    const a = document.createElement('a')
    a.download = `emg_${Date.now()}.png`
    a.href = canvasRef.current.toDataURL()
    a.click()
  }

  return (
    <div className="emgw-root">
      {/* Controls */}
      <div className="emgw-toolbar">
        <button className="emgw-btn" onClick={() => setPaused(p => !p)}>
          {paused ? <Play size={14} /> : <Pause size={14} />}
          {paused ? 'Resume' : 'Pause'}
        </button>
        <label className="emgw-toggle">
          <input type="checkbox" checked={showSmooth} onChange={e => setShowSmooth(e.target.checked)} />
          Smoothed
        </label>
        <div className="emgw-thresh-row">
          <span className="lab-stat-label">Threshold</span>
          <input
            type="range" min="5" max="500" step="5"
            value={threshold}
            onChange={e => setThreshold(Number(e.target.value))}
            className="emgw-slider"
          />
          <span className="emgw-thresh-val">{threshold} µV</span>
        </div>
        <div className="emgw-stats-row">
          <span className="lab-stat-label">Mean <b className="emgw-val">{stats.mean} µV</b></span>
          <span className="lab-stat-label">Peak <b className="emgw-val">{stats.peak} µV</b></span>
        </div>
        <button className="emgw-btn" onClick={() => { ptsRef.current = []; gestureRef.current = []; maxSeenRef.current = 0 }}>
          <Trash2 size={14} /> Clear
        </button>
        <button className="emgw-btn" onClick={exportPng}>
          <Download size={14} /> PNG
        </button>
      </div>

      {/* Canvas */}
      <div className="emgw-canvas-wrap">
        <canvas ref={canvasRef} className="emgw-canvas" />
        {paused && <div className="emgw-paused-badge">PAUSED</div>}
      </div>
    </div>
  )
}
