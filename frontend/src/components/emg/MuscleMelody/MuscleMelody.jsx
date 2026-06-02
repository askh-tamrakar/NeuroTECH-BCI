import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useLayoutEffect,
} from 'react'
import { Settings } from 'lucide-react'
import './MuscleMelody.css'

// ─── Audio file paths ───────────────────────────────────────────────────────
const SOUND_BASE = '/sounds/muscle%20melody/'

// Order: 0=Drum  1=Flute  2=Guitar  3=Relaxing
const DRUM_FILES = [
  '01_1.mp3',  // 1-1
  '1-2.mp3',
  '1-3.mp3',
  '1-4.mp3',
  '1-5.mp3',
  '1-6.mp3',
]

const FLUTE_FILES = [
  '2_1.mp3',   // 2-1
  '2-2.mp3',
  '2-3.mp3',
  '2-4mp3.mp3',
  '2-5..mp3',
  '2-6.mp3',
]

const GUITAR_FILES = [
  '3-1.mp3',
  '3-2.mp3',
  '3-3.mp3',
  '3-4.mp3',
  '3-5.mp3',
  '3-6.mp3',
]

const RELAXING_FILES = [
  'soothing-fantasy-292661.mp3',
]

const INSTRUMENT_LABELS = ['Drum', 'Flute', 'Guitar', 'Relaxing']
const INSTRUMENT_FILES  = [DRUM_FILES, FLUTE_FILES, GUITAR_FILES, RELAXING_FILES]

// Precompute start index for each group (groups have different sizes)
const GROUP_RANGES = (() => {
  let start = 0
  return INSTRUMENT_FILES.map(files => {
    const range = { start, end: start + files.length - 1, count: files.length }
    start += files.length
    return range
  })
})()

// ─── Component ────────────────────────────────────────────────────────────────
export default function MuscleMelody({ wsEvent, activeTab }) {
  // Latest channel data from backend (updated without React state)
  const channelsRef  = useRef([])  // array of {idx, label, envelope, normalized}

  // Settings state (these drive React re-renders via settings panel only)
  const [thresholds,    setThresholds]    = useState({})   // ch_idx -> 0..1
  const [instrument,    setInstrument]    = useState(0)    // 0=drum 1=flute 2=guitar
  const [settingsOpen,  setSettingsOpen]  = useState(false)

  // Audio system — AudioContext + decoded buffers (reliable across browsers)
  const audioCtxRef   = useRef(null)
  const buffersRef    = useRef([])      // Decoded AudioBuffer per file
  const buffersLoaded = useRef(false)
  const playedSoundsRef = useRef(new Set())

  // Canvas
  const canvasRef    = useRef(null)
  const containerRef = useRef(null)
  const rafRef       = useRef(null)

  // Smooth display values (per-channel, updated each frame)
  const displayValsRef = useRef({})  // ch_idx -> smoothed normalized

  // Keep latest instrument + thresholds + tab accessible in RAF without stale closure
  const instrumentRef   = useRef(instrument)
  const thresholdsRef   = useRef(thresholds)
  const activeTabRef    = useRef(activeTab)
  useEffect(() => { instrumentRef.current = instrument },  [instrument])
  useEffect(() => { thresholdsRef.current = thresholds },  [thresholds])
  useEffect(() => { activeTabRef.current = activeTab },    [activeTab])

  // Track previous normalized values to detect threshold CROSSINGS (not just being above)
  const prevNormRef = useRef({})  // ch_idx -> last normalized [0,1]

  // Flat list of all audio files from all instrument groups
  const allAudioFiles = INSTRUMENT_FILES.flat()

  // ── Receive backend events ──────────────────────────────────────────
  useEffect(() => {
    if (!wsEvent) return
    if (wsEvent.event !== 'muscle_melody' && wsEvent.type !== 'muscle_melody') return
    const chs = wsEvent.channels
    if (!Array.isArray(chs) || chs.length === 0) return

    channelsRef.current = chs

    // Initialise threshold & display val for any new channel
    setThresholds(prev => {
      const next = { ...prev }
      let changed = false
      chs.forEach(ch => {
        if (next[ch.idx] === undefined) {
          next[ch.idx] = 0.30
          changed = true
        }
      })
      return changed ? next : prev
    })
    chs.forEach(ch => {
      if (displayValsRef.current[ch.idx] === undefined) {
        displayValsRef.current[ch.idx] = 0
      }
      if (prevNormRef.current[ch.idx] === undefined) {
        prevNormRef.current[ch.idx] = 0
      }
    })
  }, [wsEvent])

  // ── Preload & decode audio files ────────────────────────────────────
  // Uses AudioContext + decodeAudioData for reliable playback (bypasses
  // browser autoplay restrictions that block HTMLAudioElement.play()).
  useEffect(() => {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    audioCtxRef.current = ctx

    let cancelled = false

    Promise.all(
      allAudioFiles.map((file) =>
        fetch(SOUND_BASE + file)
          .then((r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status} for ${file}`)
            return r.arrayBuffer()
          })
          .then((buf) => ctx.decodeAudioData(buf))
          .catch((err) => {
            console.warn(`[MuscleMelody] Failed to load ${file}:`, err)
            return null
          })
      )
    ).then((decoded) => {
      if (!cancelled) {
        buffersRef.current = decoded.filter(Boolean)
        buffersLoaded.current = true
        console.log(`[MuscleMelody] ${buffersRef.current.length} sounds loaded`)
      }
    })

    // Unlock AudioContext on first user click (required by Chrome/Safari)
    const unlock = () => {
      if (ctx.state === 'suspended') ctx.resume()
      window.removeEventListener('pointerdown', unlock)
    }
    window.addEventListener('pointerdown', unlock)

    return () => {
      cancelled = true
      window.removeEventListener('pointerdown', unlock)
      ctx.close()
    }
  }, [])

  const playNote = useCallback((comboKey, noteIdx) => {
    if (playedSoundsRef.current.has(comboKey)) return
    playedSoundsRef.current.add(comboKey)
    setTimeout(() => playedSoundsRef.current.delete(comboKey), 1000)

    const bufs = buffersRef.current
    if (!bufs.length) return

    const instr  = instrumentRef.current             // 0=drum 1=flute 2=guitar 3=relaxing
    const range  = GROUP_RANGES[instr]
    const clamped = Math.min(noteIdx, range.count - 1)
    const idx    = range.start + clamped
    const buffer = bufs[idx]
    if (!buffer) return

    try {
      const ctx = audioCtxRef.current
      if (!ctx) return
      if (ctx.state === 'suspended') ctx.resume()

      const src = ctx.createBufferSource()
      src.buffer = buffer

      // Relaxing mode: start from a random point in the track
      if (instr === 3) {
        const maxOffset = Math.max(0, buffer.duration - 4)  // leave ~4s tail
        const randomOffset = Math.random() * maxOffset
        src.start(0, randomOffset)
      } else {
        src.start(0)
      }

      src.connect(ctx.destination)
    } catch (e) {
      // Silently skip
    }
  }, [])

  // ── Sound trigger logic (called each RAF frame with current normed values) ─
  const triggerSounds = useCallback((vals) => {
    // Only play sounds when Muscle Melody tab is active
    if (activeTabRef.current !== 'melody') return

    const thr    = thresholdsRef.current
    const prev   = prevNormRef.current
    const instr  = instrumentRef.current
    const keys   = Object.keys(vals).map(Number)
    if (keys.length === 0) return

    const crossedAbove = (idx) => {
      const now = vals[idx] ?? 0
      const was = prev[idx] ?? 0
      return now > (thr[idx] ?? 0.3) && was <= (thr[idx] ?? 0.3)
    }

    // For each channel that just crossed above threshold, play a note
    // determined by how hard the muscle is contracting.
    // Note index 0 = weakest, 5 (or max) = strongest.
    keys.forEach((idx) => {
      if (!crossedAbove(idx)) return

      const groupFiles = INSTRUMENT_FILES[instr] ?? []
      const maxNote    = Math.max(1, groupFiles.length - 1)
      const normVal    = Math.min(vals[idx] ?? 0, 1)

      // Map 0-1 to note index: 0 = weakest, maxNote = strongest
      let noteIdx = 0
      if (instr === 3) {
        noteIdx = 0  // Relaxing: always the same track, random offset in playNote
      } else {
        noteIdx = Math.round(normVal * maxNote)
      }

      // Debounce per channel so each squeeze fires once
      const comboKey = `ch${idx}`
      if (playedSoundsRef.current.has(comboKey)) return
      playedSoundsRef.current.add(comboKey)
      setTimeout(() => playedSoundsRef.current.delete(comboKey), 500)

      // Resolve buffer index via precomputed ranges
      const bufs  = buffersRef.current
      if (!bufs.length) return

      const range  = GROUP_RANGES[instr]
      const clamped = Math.min(noteIdx, range.count - 1)
      const bufIdx  = range.start + clamped
      const buffer  = bufs[bufIdx]
      if (!buffer) return

      try {
        const ctx = audioCtxRef.current
        if (!ctx) return
        if (ctx.state === 'suspended') ctx.resume()

        const src = ctx.createBufferSource()
        src.buffer = buffer

        // Relaxing: start from a random offset so each squeeze plays a different snippet
        if (instr === 3) {
          const maxOffset = Math.max(0, buffer.duration - 4)
          src.start(0, Math.random() * maxOffset)
        } else {
          src.start(0)
        }

        src.connect(ctx.destination)
      } catch (e) {
        // Silently skip
      }
    })

    // Update prev values for next frame
    keys.forEach((idx) => { prev[idx] = vals[idx] ?? 0 })
  }, []) // No deps — all values come from refs

  // ── Canvas draw ─────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas    = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const chs = channelsRef.current
    if (!chs || chs.length === 0) {
      // Draw a waiting message
      const { width: W, height: H } = container.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      if (canvas.width !== Math.floor(W * dpr)) {
        canvas.width  = Math.floor(W * dpr)
        canvas.height = Math.floor(H * dpr)
        canvas.style.width  = `${W}px`
        canvas.style.height = `${H}px`
      }
      const ctx = canvas.getContext('2d')
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, W, H)
      ctx.fillStyle = 'rgba(148,163,184,0.4)'
      ctx.font = '14px system-ui'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('Waiting for EMG signal…', W / 2, H / 2)
      return
    }

    // Update display smoothing (EMA on frontend just for visual fluid motion)
    const DISPLAY_ALPHA = 0.12
    const currentNorm = {}
    chs.forEach(ch => {
      const prev = displayValsRef.current[ch.idx] ?? 0
      const smooth = prev + DISPLAY_ALPHA * (ch.normalized - prev)
      displayValsRef.current[ch.idx] = smooth
      currentNorm[ch.idx] = smooth
    })

    // Trigger sounds from latest real (un-smoothed) normed values
    const rawNorm = {}
    chs.forEach(ch => { rawNorm[ch.idx] = ch.normalized })
    triggerSounds(rawNorm)

    // ── Layout ──────────────────────────────────────────────────────
    const { width: cssW, height: cssH } = container.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    if (canvas.width !== Math.floor(cssW * dpr)) {
      canvas.width  = Math.floor(cssW * dpr)
      canvas.height = Math.floor(cssH * dpr)
      canvas.style.width  = `${cssW}px`
      canvas.style.height = `${cssH}px`
    }

    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, cssW, cssH)

    const scale      = cssW / 800
    const padding    = 10 * scale
    const barCount   = chs.length
    const gap        = cssW * 0.08 / barCount
    const barW       = (cssW - padding * 2) / barCount - gap
    const infoH      = Math.min(60 * scale, 60)
    const labelH     = Math.min(44 * scale, 44)
    const axisGap    = 6
    const barAreaH   = cssH - padding * 2 - infoH - labelH - axisGap * 2
    const radius     = Math.min(12 * scale, 12)
    const fontSz     = Math.max(11, infoH * 0.28)

    // Detect theme from document class
    const isDark     = document.documentElement.classList.contains('dark')
    const bgCol      = isDark ? '#020817' : '#ffffff'
    const textCol    = isDark ? '#e2e8f0' : '#1e293b'
    const borderCol  = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.10)'

    chs.forEach((ch, i) => {
      const thr = thresholdsRef.current[ch.idx] ?? 0.3
      const totalW = barCount * (barW + gap)
      const leftMargin = Math.max(0, (cssW - totalW) / 2)
      const x0 = leftMargin + i * (barW + gap)

      // ── Info block (top) ──
      ctx.fillStyle = bgCol
      ctx.strokeStyle = borderCol
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.roundRect(x0, padding, barW, infoH, [radius, radius, 0, 0])
      ctx.fill()
      ctx.stroke()

      ctx.fillStyle = textCol
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = `${fontSz * 0.75}px system-ui`
      ctx.fillText('Normalized', x0 + barW / 2, padding + infoH * 0.28)
      ctx.font = `bold ${fontSz}px system-ui`
      ctx.fillText(
        currentNorm[ch.idx] !== undefined ? currentNorm[ch.idx].toFixed(3) : '0.000',
        x0 + barW / 2,
        padding + infoH * 0.70
      )

      // ── Bar background ──
      const barY = padding + infoH + axisGap
      ctx.fillStyle = bgCol
      ctx.strokeStyle = borderCol
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.roundRect(x0, barY, barW, barAreaH, 4)
      ctx.fill()
      ctx.stroke()

      // ── Filled bar ──
      const normVal = currentNorm[ch.idx] ?? 0
      const bh = normVal * barAreaH
      if (bh > 0) {
        const barTop = barY + barAreaH - bh
        const grad = ctx.createLinearGradient(x0, barY + barAreaH, x0, barY)
        const one3 = 1 / 3, two3 = 2 / 3
        if (normVal <= one3) {
          grad.addColorStop(0, '#22c55e')
          grad.addColorStop(1, '#22c55e')
        } else if (normVal <= two3) {
          grad.addColorStop(0, '#22c55e')
          grad.addColorStop(one3 / normVal, '#22c55e')
          grad.addColorStop(1, '#eab308')
        } else {
          grad.addColorStop(0, '#22c55e')
          grad.addColorStop(one3 / normVal, '#22c55e')
          grad.addColorStop(two3 / normVal, '#eab308')
          grad.addColorStop(1, '#ef4444')
        }
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.roundRect(x0, barTop, barW, bh, [0, 0, 4, 4])
        ctx.fill()
      }

      // ── Threshold line ──
      const thrY = barY + barAreaH * (1 - thr)
      ctx.strokeStyle = '#f59e0b'
      ctx.lineWidth = 2
      ctx.setLineDash([4, 3])
      ctx.beginPath()
      ctx.moveTo(x0 + 4, thrY)
      ctx.lineTo(x0 + barW - 4, thrY)
      ctx.stroke()
      ctx.setLineDash([])

      // Small threshold label
      ctx.fillStyle = '#f59e0b'
      ctx.font = `${Math.max(9, fontSz * 0.65)}px system-ui`
      ctx.textAlign = 'left'
      ctx.fillText(`thr ${thr.toFixed(2)}`, x0 + 5, thrY - 4)

      // ── Label block (bottom) ──
      const labelY = barY + barAreaH + axisGap
      ctx.fillStyle = bgCol
      ctx.strokeStyle = borderCol
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.roundRect(x0, labelY, barW, labelH, [0, 0, radius / 2, radius / 2])
      ctx.fill()
      ctx.stroke()

      ctx.fillStyle = textCol
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = `${Math.max(11, fontSz * 0.85)}px system-ui`
      ctx.fillText(ch.label ?? `ch${ch.idx}`, x0 + barW / 2, labelY + labelH / 2)
    })
  }, [triggerSounds])

  // ── RAF loop ────────────────────────────────────────────────────────
  const loop = useCallback(() => {
    draw()
    rafRef.current = requestAnimationFrame(loop)
  }, [draw])

  useLayoutEffect(() => {
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [loop])

  // ── ResizeObserver ──────────────────────────────────────────────────
  useEffect(() => {
    const ro = new ResizeObserver(() => draw())
    if (containerRef.current) ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [draw])

  // ── Cleanup ────────────────────────────────────────────
  // (AudioContext cleaned up in the preload effect above)

  // ── Threshold controls ──────────────────────────────────────────────
  const adjustThreshold = (idx, delta) => {
    setThresholds(prev => ({
      ...prev,
      [idx]: Math.min(1, Math.max(0, Math.round(((prev[idx] ?? 0.3) + delta) * 100) / 100)),
    }))
  }

  // ── Render ──────────────────────────────────────────────────────────
  const channels = channelsRef.current

  return (
    <div className="mm-root">
      {/* Canvas area */}
      <div className="mm-canvas-wrap" ref={containerRef}>
        <canvas ref={canvasRef} className="mm-canvas" />
      </div>

      {/* Controls bar */}
      <div className="mm-controls">

        {/* Instrument selector */}
        <div className="mm-instrument-group">
          {INSTRUMENT_LABELS.map((label, i) => (
            <button
              key={label}
              className={`mm-instr-btn ${instrument === i ? 'active' : ''}`}
              onClick={() => setInstrument(i)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Settings popover */}
        <div className="mm-settings-wrap">
          <button
            className="mm-settings-btn"
            onClick={() => setSettingsOpen(v => !v)}
            title="Threshold settings"
          >
            <Settings size={16} />
          </button>

          {settingsOpen && (
            <div className="mm-popover">
              <p className="mm-popover-title">Thresholds (0 – 1)</p>
              {channels.length === 0 ? (
                <p className="mm-popover-empty">No EMG channels yet</p>
              ) : (
                channels.map(ch => {
                  const thr = thresholds[ch.idx] ?? 0.3
                  return (
                    <div key={ch.idx} className="mm-thr-row">
                      <span className="mm-thr-label">{ch.label ?? `ch${ch.idx}`}</span>
                      <button
                        className={`mm-thr-btn ${thr === 0 ? 'at-min' : ''}`}
                        onClick={() => adjustThreshold(ch.idx, -0.01)}
                      >−</button>
                      <span className="mm-thr-val">{thr.toFixed(2)}</span>
                      <button
                        className={`mm-thr-btn ${thr === 1 ? 'at-max' : ''}`}
                        onClick={() => adjustThreshold(ch.idx, +0.01)}
                      >+</button>
                    </div>
                  )
                })
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
