import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Zap, RotateCcw, Trophy, ChevronLeft, ChevronDown } from 'lucide-react'
import './MuscleMeter.css'
import '../../../styles/ui/PillNav.css'

// ── Marvel Visual Tiers ───────────────────────────────────────────────
const TIERS = [
  { id: 'starlord', name: 'Star-Lord', color: '#9ca3af', min: 0,    max: 0.16 },
  { id: 'antman',   name: 'Ant-Man',   color: '#3b82f6', min: 0.16, max: 0.33 },
  { id: 'hulk',     name: 'Hulk',      color: '#22c55e', min: 0.33, max: 0.50 },
  { id: 'thor',     name: 'Thor',      color: '#eab308', min: 0.50, max: 0.66 },
  { id: 'ironman',  name: 'Iron Man',  color: '#ef4444', min: 0.66, max: 0.83 },
  { id: 'thanos',   name: 'Thanos',    color: '#a855f7', min: 0.83, max: 1.0  },
]

// ── Strength Identity Tiers ───────────────────────────────────────────
const STRENGTH_NAMES = [
  { pos: 10, male: 'Pulse',        female: 'Spark',         mDesc: 'Faint neural signal',                   fDesc: 'First sign of electrical activity',    min: 0,    max: 0.1  },
  { pos: 9,  male: 'Twitch',       female: 'Reflex',        mDesc: 'Initial muscle contraction',            fDesc: 'Quick, reactive muscle firing',        min: 0.1,  max: 0.2  },
  { pos: 8,  male: 'Flex',         female: 'Tone',          mDesc: 'Visible muscle engagement',             fDesc: 'Defined, activated strength',          min: 0.2,  max: 0.3  },
  { pos: 7,  male: 'Surge',        female: 'Torrent',       mDesc: 'Sudden burst of power',                 fDesc: 'Unstoppable flowing force',            min: 0.3,  max: 0.4  },
  { pos: 6,  male: 'Iron',         female: 'Steel',         mDesc: 'Solid, reliable strength',              fDesc: 'Unyielding, hardened power',           min: 0.4,  max: 0.5  },
  { pos: 5,  male: 'Impact',       female: 'Velocity',      mDesc: 'Force that leaves a mark',              fDesc: 'Speed combined with force',            min: 0.5,  max: 0.6  },
  { pos: 4,  male: 'Voltage',      female: 'Current',       mDesc: 'High-intensity electrical drive',       fDesc: 'High-voltage continuous energy',       min: 0.6,  max: 0.7  },
  { pos: 3,  male: 'Overdrive',    female: 'Catalyst',      mDesc: 'Pushing past normal limits',            fDesc: 'The force that triggers a breakdown',  min: 0.7,  max: 0.8  },
  { pos: 2,  male: 'Titan',        female: 'Valkyrie',      mDesc: 'Massive, legendary power',              fDesc: 'Mythic, elite warrior strength',        min: 0.8,  max: 0.9  },
  { pos: 1,  male: 'Apex Kinetic', female: 'Alpha Kinetic', mDesc: 'The absolute peak of motion and force', fDesc: 'The ultimate dominant force',          min: 0.9,  max: 1.01 },
]

function getStrengthEntry(pct) {
  return STRENGTH_NAMES.find(s => pct >= s.min && pct < s.max) || STRENGTH_NAMES[0]
}

function contrastColor(hex) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.45 ? '#111111' : '#ffffff'
}

const CX = 200, CY = 190, R = 160
const START_ANG = Math.PI
const END_ANG   = 2 * Math.PI
const TOTAL_ANG = END_ANG - START_ANG
const KNOB_R    = 15        // #1: smaller knob radius

function polarToXY(angle, radius = R) {
  return { x: CX + radius * Math.cos(angle), y: CY + radius * Math.sin(angle) }
}

function tierArc(tier) {
  const a0 = START_ANG + tier.min * TOTAL_ANG
  const a1 = START_ANG + tier.max * TOTAL_ANG
  const p0 = polarToXY(a0, R - 1);  const p1 = polarToXY(a1, R - 1)
  const r0 = polarToXY(a0, R - 22); const r1 = polarToXY(a1, R - 22)
  const large = (tier.max - tier.min) > 0.5 ? 1 : 0
  return `M ${p0.x} ${p0.y} A ${R-1} ${R-1} 0 ${large} 1 ${p1.x} ${p1.y} L ${r1.x} ${r1.y} A ${R-22} ${R-22} 0 ${large} 0 ${r0.x} ${r0.y} Z`
}

function tierTextPath(tier, radiusOffset = -12) {
  const a0 = START_ANG + tier.min * TOTAL_ANG
  const a1 = START_ANG + tier.max * TOTAL_ANG
  const r  = R + radiusOffset
  const p0 = polarToXY(a0, r); const p1 = polarToXY(a1, r)
  const large = (tier.max - tier.min) > 0.5 ? 1 : 0
  return `M ${p0.x} ${p0.y} A ${r} ${r} 0 ${large} 1 ${p1.x} ${p1.y}`
}

function tierOuterTextPath(tier) { return tierTextPath(tier, 5) }
function needleAngle(pct) { return START_ANG + Math.max(0, Math.min(1, pct)) * TOTAL_ANG }

const EMA_ALPHA     = 0.12
const MVC_LS_KEY    = 'emglab_mvc_rms'
const LB_LS_KEY     = 'emglab_leaderboard'
const THRESH_LS_KEY = 'emglab_threshold_max'
const ENV_BUF_SIZE  = 64
const DURATION_OPTIONS = [3, 5, 10, 15]

function loadLeaderboard() {
  try { return JSON.parse(localStorage.getItem(LB_LS_KEY)) || [] } catch { return [] }
}
function saveLeaderboard(lb) { localStorage.setItem(LB_LS_KEY, JSON.stringify(lb)) }

export default function MuscleMeter({
  rmsHistoryRef, rmsHeadRef, latestRmsRef, latestLabelRef,
  wsEvent, wsMessage,
  activeTab, onTabChange, tabs,
}) {
  const [displayPct, setDisplayPct]       = useState(0)
  const [activeTier, setActiveTier]       = useState(TIERS[0])
  const [mvc, setMvc]                     = useState(() => {
    const v = parseFloat(localStorage.getItem(MVC_LS_KEY))
    return isNaN(v) || v <= 0 ? null : v
  })
  const [isCalibrating, setIsCalibrating] = useState(false)
  const [calibProgress, setCalibProgress] = useState(0)
  const [peakRms, setPeakRms]             = useState(0)

  // Game flow
  const [gamePhase, setGamePhase]         = useState('idle')
  const [testDuration, setTestDuration]   = useState(5)
  const [gameCountdown, setGameCountdown] = useState(5)
  const [gamePeak, setGamePeak]           = useState(0)
  const [gamePeakTier, setGamePeakTier]   = useState(TIERS[0])
  const gamePeakRef                       = useRef(0)
  const gamePeakTierRef                   = useRef(TIERS[0])

  // Naming overlay
  const [nameInput, setNameInput]         = useState('')
  const [nameCountdown, setNameCountdown] = useState(5)
  const [genderState, setGenderState]     = useState(null)
  const genderRef                         = useRef(null)
  const setGender = (val) => {
    const v = typeof val === 'function' ? val(genderRef.current) : val
    genderRef.current = v; setGenderState(v)
  }
  const nameTimerRef = useRef(null)

  // Sidebar
  const [leaderboard, setLeaderboard]     = useState(loadLeaderboard)
  const [lbHoverEntry, setLbHoverEntry]   = useState(null)   // #7 sliding panel
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [thresholdMax, setThresholdMax]   = useState(() => {
    const v = parseFloat(localStorage.getItem(THRESH_LS_KEY))
    return isNaN(v) || v <= 0 ? '' : String(v)
  })

  // Knob
  const [knobPressed, setKnobPressed]     = useState(false)

  // Refs
  const smoothRef    = useRef(0)
  const animRef      = useRef(null)
  const autoCeilRef  = useRef(1)
  const countdownRef = useRef(null)
  const envBufRef    = useRef(new Float32Array(ENV_BUF_SIZE).fill(0))
  const envIdxRef    = useRef(0)
  const envSumRef    = useRef(0)
  const strengthRef  = useRef(0)

  // ── RAF loop ──────────────────────────────────────────────────────────
  const tick = useCallback(() => {
    const raw = strengthRef.current > 0 ? strengthRef.current : (latestRmsRef.current ?? 0)
    const thOverride = parseFloat(thresholdMax)
    const ceil = (!isNaN(thOverride) && thOverride > 0)
      ? thOverride
      : (mvc ?? (autoCeilRef.current > 1 ? autoCeilRef.current : null))
    const pct = ceil ? Math.min(raw / ceil, 1) : 0
    smoothRef.current += EMA_ALPHA * (pct - smoothRef.current)
    const sp = smoothRef.current
    const tier = TIERS.find(t => sp >= t.min && sp < t.max) || TIERS[TIERS.length - 1]
    setDisplayPct(sp); setActiveTier(tier)
    const envVal = strengthRef.current > 0 ? strengthRef.current : (latestRmsRef.current ?? 0)
    setPeakRms(p => Math.max(p, envVal))
    if (!mvc && envVal > 0) autoCeilRef.current = Math.max(autoCeilRef.current, envVal * 1.3)
    if (sp > gamePeakRef.current) { gamePeakRef.current = sp; gamePeakTierRef.current = tier }
    animRef.current = requestAnimationFrame(tick)
  }, [mvc, latestRmsRef, thresholdMax])

  useEffect(() => {
    animRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animRef.current)
  }, [tick])

  // ── WebSocket EMG ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!wsMessage) return
    const batch = wsMessage.raw?._batch
    if (!batch?.length) return
    batch.forEach(sample => {
      for (const chData of Object.values(sample.channels || {})) {
        if ((chData.type || '').toUpperCase() === 'EMG') {
          const absVal = Math.abs(chData.value)
          const buf = envBufRef.current; const idx = envIdxRef.current % buf.length
          envSumRef.current -= buf[idx]; envSumRef.current += absVal
          buf[idx] = absVal; envIdxRef.current++
          strengthRef.current = (envSumRef.current / buf.length) * 2; break
        }
      }
    })
  }, [wsMessage])

  // ── MVC Calibration ───────────────────────────────────────────────────
  useEffect(() => {
    if (!isCalibrating) return
    const start = performance.now(); const duration = 3000; let localPeak = 0; let raf
    function calibTick(now) {
      const elapsed = now - start
      setCalibProgress(Math.min(elapsed / duration, 1))
      const r = strengthRef.current > 0 ? strengthRef.current : (latestRmsRef.current ?? 0)
      if (r > localPeak) localPeak = r
      if (elapsed < duration) { raf = requestAnimationFrame(calibTick) }
      else {
        setIsCalibrating(false); setCalibProgress(0)
        if (localPeak > 0) { setMvc(localPeak); localStorage.setItem(MVC_LS_KEY, String(localPeak)) }
      }
    }
    raf = requestAnimationFrame(calibTick)
    return () => cancelAnimationFrame(raf)
  }, [isCalibrating, latestRmsRef])

  // ── Game start ────────────────────────────────────────────────────────
  const handleStart = useCallback(() => {
    if (gamePhase !== 'idle') return
    gamePeakRef.current = 0; gamePeakTierRef.current = TIERS[0]
    setGameCountdown(testDuration); setGamePhase('running')
    let remaining = testDuration
    countdownRef.current = setInterval(() => {
      remaining -= 1; setGameCountdown(remaining)
      if (remaining <= 0) {
        clearInterval(countdownRef.current)
        setGamePeak(gamePeakRef.current); setGamePeakTier(gamePeakTierRef.current)
        setGamePhase('result')
        setTimeout(() => {
          setNameInput(''); genderRef.current = null; setGenderState(null)
          setNameCountdown(5); setGamePhase('naming')
        }, 1800)
      }
    }, 1000)
  }, [gamePhase, testDuration])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const commitName = useCallback((rawName) => {
    clearInterval(nameTimerRef.current)
    const marvelTier = gamePeakTierRef.current; const entry = getStrengthEntry(gamePeakRef.current)
    const rg = genderRef.current ?? (Math.random() < 0.5 ? 'male' : 'female')
    const finalName = rawName.trim() || entry[rg]
    setLeaderboard(prev => {
      const updated = [...prev, {
        name: finalName, pct: Math.round(gamePeakRef.current * 100),
        tierId: marvelTier.id, tierColor: marvelTier.color, tierName: marvelTier.name,
        strengthDesc: rg === 'female' ? entry.fDesc : entry.mDesc,
        date: new Date().toLocaleDateString(),
      }].sort((a, b) => b.pct - a.pct).slice(0, 10)
      saveLeaderboard(updated); return updated
    })
    setGamePhase('idle'); setNameInput(''); genderRef.current = null; setGenderState(null)
  }, [])

  useEffect(() => {
    if (gamePhase !== 'naming') return
    setNameCountdown(5)
    nameTimerRef.current = setInterval(() => {
      setNameCountdown(c => {
        if (c <= 1) { clearInterval(nameTimerRef.current); commitName(''); return 0 }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(nameTimerRef.current)
  }, [gamePhase, commitName])

  const handleReset = useCallback(() => {
    clearInterval(countdownRef.current); clearInterval(nameTimerRef.current)
    setMvc(null); localStorage.removeItem(MVC_LS_KEY)
    setPeakRms(0); autoCeilRef.current = 1
    strengthRef.current = 0; envSumRef.current = 0
    envBufRef.current.fill(0); envIdxRef.current = 0
    setGamePhase('idle'); setGamePeak(0)
  }, [])

  const handleThresholdChange = useCallback((e) => {
    const val = e.target.value; setThresholdMax(val)
    const n = parseFloat(val)
    if (!isNaN(n) && n > 0) localStorage.setItem(THRESH_LS_KEY, String(n))
    else localStorage.removeItem(THRESH_LS_KEY)
  }, [])

  // ── Derived SVG values ────────────────────────────────────────────────
  const ang         = needleAngle(displayPct)
  const tipLen      = R - 36
  const needleTip   = polarToXY(ang, tipLen)
  const needleBase  = polarToXY(ang + Math.PI * 0.05, 12)
  const needleBase2 = polarToXY(ang - Math.PI * 0.05, 12)

  // Knob — 3D gradient when idle, red when running/pressed
  const isRunning  = gamePhase === 'running'
  const isPressed  = knobPressed && gamePhase === 'idle'
  const knobFill   = '#ef4444'
  const knobStroke = isRunning ? '#a00000' : activeTier.color

  // Arc band
  const arcMidAng = START_ANG + (activeTier.min + activeTier.max) / 2 * TOTAL_ANG
  const arcFg     = contrastColor(activeTier.color)

  const namingEntry  = getStrengthEntry(gamePeak)
  const namingGender = genderState ?? 'male'

  // #5: active tab label for custom pill
  const activeTabLabel = (tabs || []).find(t => t.id === (activeTab || 'meter'))?.label || 'Meter'

  return (
    <div className="mm-root">

      {/* ═══ SIDEBAR ══════════════════════════════════════════════════ */}
      <div className={`mm-sidebar${isSidebarCollapsed ? ' mm-sidebar--collapsed' : ''}`}>

        {isSidebarCollapsed && (
          <div className="mm-collapsed-strip">
            <button className="mm-icon-btn mm-icon-btn--emoji" onClick={() => setIsSidebarCollapsed(false)} title="Expand">
              💪
            </button>
            <hr className="mm-divider" />
            <button className="mm-icon-btn" onClick={() => setIsSidebarCollapsed(false)} title="Nav">
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="6" height="6"/><rect x="9" y="3" width="6" height="6"/><rect x="3" y="9" width="6" height="6"/><rect x="9" y="9" width="6" height="6"/></svg>
            </button>
            <button className="mm-icon-btn" onClick={() => setIsSidebarCollapsed(false)} title="Calibrate"><Zap size={18} /></button>
            <button className="mm-icon-btn" onClick={() => setIsSidebarCollapsed(false)} title="Leaderboard"><Trophy size={18} /></button>
          </div>
        )}

        {!isSidebarCollapsed && (
          <div className="mm-sidebar-inner">

            {/* Header */}
            <div className="mm-sidebar-header">
              <div>
                <div className="mm-sidebar-title">
                  <span style={{ fontSize: '1.1rem' }}>💪</span> Strength Lab
                </div>
                <div className="mm-sidebar-subtitle">Muscle Meter</div>
              </div>
              <button className="mm-collapse-btn" onClick={() => setIsSidebarCollapsed(true)}>
                <ChevronLeft size={20} />
              </button>
            </div>

            {/* #5: Navigate — custom pill + dropdown pill (PillNav style) */}
            <div className="mm-sidebar-section">
              <div className="mm-nav-pill-bar">
                {/* Custom pill: active tab indicator */}
                <div
                  className="pill mm-nav-current-pill"
                  style={{ '--pill-bg': activeTier.color, '--pill-text': contrastColor(activeTier.color), '--base': activeTier.color }}
                >
                  <span className="label-stack">
                    <span className="pill-label">{activeTabLabel}</span>
                  </span>
                </div>
                {/* Dropdown pill: navigate to other views */}
                <div className="mm-pill-select-wrap mm-nav-dropdown">
                  <select
                    className="mm-pill-select"
                    value={activeTab || 'meter'}
                    onChange={e => onTabChange?.(e.target.value)}
                  >
                    {(tabs || []).map(tab => <option key={tab.id} value={tab.id}>{tab.label}</option>)}
                  </select>
                  <ChevronDown size={12} className="mm-pill-chevron" />
                </div>
              </div>
            </div>

            {/* Test Duration */}
            <div className="mm-sidebar-section">
              <label className="mm-section-label">Test Duration</label>
              <div className="mm-pill-row">
                {DURATION_OPTIONS.map(d => (
                  <button key={d} className={`mm-pill-btn${testDuration === d ? ' active' : ''}`}
                    onClick={() => { setTestDuration(d); setGameCountdown(d) }}
                    disabled={gamePhase === 'running'}>{d}s</button>
                ))}
              </div>
            </div>

            {/* Live Stats */}
            <div className="mm-sidebar-section mm-stats-box">
              <label className="mm-section-label">Live Stats</label>
              <div className="mm-stat-row">
                <span className="mm-stat-lbl">Strength</span>
                <span className="mm-stat-val">{(strengthRef.current > 0 ? strengthRef.current : (latestRmsRef.current ?? 0)).toFixed(1)} µV</span>
              </div>
              <div className="mm-stat-row">
                <span className="mm-stat-lbl">Session Peak</span>
                <span className="mm-stat-val">{peakRms.toFixed(1)} µV</span>
              </div>
              <div className="mm-stat-row">
                <span className="mm-stat-lbl">MVC Baseline</span>
                <span className="mm-stat-val" style={{ color: mvc ? '#22c55e' : '#f59e0b' }}>
                  {mvc ? `${mvc.toFixed(1)} µV` : autoCeilRef.current > 1 ? 'AUTO' : '—'}
                </span>
              </div>
            </div>

            {/* Max Threshold */}
            <div className="mm-sidebar-section">
              <label className="mm-section-label">Max Threshold (µV)</label>
              <input type="number" className="mm-input" placeholder="Auto" min="1"
                value={thresholdMax} onChange={handleThresholdChange} />
            </div>

            {/* Calibrate / Reset */}
            <div className="mm-sidebar-section">
              {isCalibrating && (
                <div className="mm-calib-bar">
                  <div className="mm-calib-fill" style={{ width: `${calibProgress * 100}%` }} />
                  <span className="mm-calib-label">MAX SQUEEZE — {Math.round((1 - calibProgress) * 3)}s</span>
                </div>
              )}
              <div className="mm-btn-row">
                <button className="mm-btn primary" onClick={() => setIsCalibrating(true)}
                  disabled={isCalibrating || gamePhase === 'running'}>
                  <Zap size={13} /> {isCalibrating ? 'Calibrating…' : 'Calibrate MVC'}
                </button>
                <button className="mm-btn" onClick={handleReset} disabled={gamePhase === 'running'}>
                  <RotateCcw size={13} /> Reset
                </button>
              </div>
            </div>

            {/* Leaderboard — hover reveals sliding panel from bottom of list */}
            <div className="mm-sidebar-section mm-leaderboard">
              <label className="mm-section-label">
                <Trophy size={12} style={{ display: 'inline', marginRight: 4 }} />Top 10
              </label>
              {leaderboard.length === 0
                ? <div className="mm-lb-empty">No scores yet — press START!</div>
                : leaderboard.map((e, i) => (
                  <div key={i} className="mm-lb-row"
                    onMouseEnter={() => setLbHoverEntry(e)}
                    onMouseLeave={() => setLbHoverEntry(null)}>
                    <span className="mm-lb-rank">#{i + 1}</span>
                    <span className="mm-lb-dot" style={{ background: e.tierColor }} />
                    <div className="mm-lb-name-wrap">
                      <span className="mm-lb-name">{e.name}</span>
                      <span className="mm-lb-marvel" style={{ color: e.tierColor }}>— {e.tierName}</span>
                    </div>
                    <span className="mm-lb-pct" style={{ color: e.tierColor }}>{e.pct}%</span>
                  </div>
                ))
              }
              {leaderboard.length > 0 && (
                <button className="mm-btn mm-lb-clear"
                  onClick={() => { setLeaderboard([]); saveLeaderboard([]) }}>Clear Board</button>
              )}
              {/* Sliding description panel — slides up from bottom of leaderboard on row hover */}
              <div className={`mm-desc-panel${lbHoverEntry ? ' open' : ''}`}
                style={{ borderTopColor: lbHoverEntry?.tierColor || 'var(--border)' }}>
                {lbHoverEntry && (
                  <>
                    <div className="mm-desc-panel-name" style={{ color: lbHoverEntry.tierColor }}>
                      {lbHoverEntry.name}
                      <span className="mm-desc-panel-tier"> — {lbHoverEntry.tierName}</span>
                      <span className="mm-desc-panel-pct"> {lbHoverEntry.pct}%</span>
                    </div>
                    <div className="mm-desc-panel-text">{lbHoverEntry.strengthDesc}</div>
                  </>
                )}
              </div>
            </div>

          </div>
        )}
      </div>

      {/* ═══ GAUGE AREA ═══════════════════════════════════════════════ */}
      <div className="mm-gauge-area">
        <svg viewBox="0 0 400 215" className="mm-svg" preserveAspectRatio="xMidYMid meet" overflow="visible">
          <defs>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <radialGradient id="knob3d" cx="38%" cy="32%" r="65%" fx="38%" fy="32%">
              <stop offset="0%"   stopColor="#ddd" stopOpacity="1" />
              <stop offset="40%"  stopColor="#888" stopOpacity="1" />
              <stop offset="100%" stopColor="#111" stopOpacity="1" />
            </radialGradient>
          </defs>

          {/* Tier arcs */}
          {TIERS.map(tier => (
            <path key={tier.id} d={tierArc(tier)} fill={tier.color}
              opacity={activeTier.id === tier.id ? 0.95 : 0.22}
              filter={activeTier.id === tier.id ? 'url(#glow)' : undefined}
              style={{ transition: 'opacity 0.25s ease' }} />
          ))}

          {/* Inactive tier labels on arc */}
          {TIERS.filter(t => t.id !== activeTier.id).map(tier => {
            const midAng = START_ANG + (tier.min + tier.max) / 2 * TOTAL_ANG
            const pathId = `tp-${tier.id}`
            return (
              <g key={`lbl-${tier.id}`}>
                <defs><path id={pathId} d={tierTextPath(tier)} /></defs>
                <text fill={tier.color} fontSize="8.5" fontWeight="800" textAnchor="middle"
                  letterSpacing="0.5" opacity="0.75"
                  style={{ filter: `drop-shadow(0 0 3px ${tier.color})` }}>
                  <textPath href={`#${pathId}`} startOffset="50%"
                    side={midAng > Math.PI * 1.5 ? 'right' : 'left'}>
                    {tier.name.toUpperCase()}
                  </textPath>
                </text>
              </g>
            )
          })}

          {/* Active tier label outside arc */}
          {(() => {
            const midAng = START_ANG + (activeTier.min + activeTier.max) / 2 * TOTAL_ANG
            const pathId = `tp-outer-${activeTier.id}`
            return (
              <g>
                <defs><path id={pathId} d={tierOuterTextPath(activeTier)} /></defs>
                <text fill={activeTier.color} fontSize="10" fontWeight="900"
                  textAnchor="middle" letterSpacing="0.8" style={{ transition: 'fill 0.25s' }}>
                  <textPath href={`#${pathId}`} startOffset="50%"
                    side={midAng > Math.PI * 1.5 ? 'right' : 'left'}>
                    {activeTier.name.toUpperCase()}
                  </textPath>
                </text>
              </g>
            )
          })()}

          {/* Arc band: single textPath keeps 💪 X% 💪 on the same curve */}
          {(() => {
            const side = arcMidAng > Math.PI * 1.5 ? 'right' : 'left'
            const pid  = `tp-pct-${activeTier.id}`
            return (
              <g>
                <defs>
                  <path id={pid} d={tierTextPath(activeTier, -11)} />
                </defs>
                <text fill={arcFg} fontSize="8" fontWeight="900" textAnchor="middle" letterSpacing="0.5">
                  <textPath href={`#${pid}`} startOffset="50%" side={side}>
                    {`💪 ${Math.round(displayPct * 100)}% 💪`}
                  </textPath>
                </text>
              </g>
            )
          })()}

          {/* Track outline */}
          <path
            d={`M ${polarToXY(START_ANG).x} ${polarToXY(START_ANG).y} A ${R} ${R} 0 0 1 ${polarToXY(END_ANG).x} ${polarToXY(END_ANG).y}`}
            fill="none" stroke="var(--border)" strokeWidth="1" />

          {/* Tier tick marks */}
          {TIERS.map((tier, i) => {
            if (i === 0) return null
            const a = START_ANG + tier.min * TOTAL_ANG
            const outer = polarToXY(a, R + 4); const inner = polarToXY(a, R - 28)
            return <line key={tier.id} x1={outer.x} y1={outer.y} x2={inner.x} y2={inner.y}
              stroke="var(--border)" strokeWidth="1.5" />
          })}

          {/* Needle */}
          <polygon
            points={`${needleTip.x},${needleTip.y} ${needleBase.x},${needleBase.y} ${needleBase2.x},${needleBase2.y}`}
            fill={activeTier.color} filter="url(#glow)" />

          {/* Knob — flat red, press scale animation */}
          <g
            onClick={handleStart}
            onMouseDown={() => { if (gamePhase === 'idle') setKnobPressed(true) }}
            onMouseUp={() => setKnobPressed(false)}
            onMouseLeave={() => setKnobPressed(false)}
            style={{
              cursor: gamePhase === 'idle' ? 'pointer' : 'default',
              transform: isPressed ? 'scale(0.80)' : 'scale(1)',
              transformBox: 'fill-box',
              transformOrigin: '50% 50%',
              transition: 'transform 0.12s cubic-bezier(0.34, 1.56, 0.64, 1)',
            }}
          >
            {/* Shadow ring */}
            <circle cx={CX} cy={CY} r={KNOB_R + 2}
              fill="none" stroke="rgba(0,0,0,0.4)" strokeWidth="2" />
            {/* Main knob — 3D radial gradient */}
            <circle cx={CX} cy={CY} r={KNOB_R}
              fill={knobFill}
              stroke={knobStroke} strokeWidth="2"
              style={{ filter: `drop-shadow(0 2px 4px ${knobStroke}88)`, transition: 'fill 0.15s, stroke 0.15s' }}
            />
            {/* Idle — plain START label */}
            {gamePhase === 'idle' && (
              <text x={CX} y={CY} textAnchor="middle" dominantBaseline="middle"
                fill="#fff" fontSize="5" fontWeight="900" letterSpacing="0.6"
                style={{ userSelect: 'none' }}>START</text>
            )}
            {/* Running — countdown, plain white */}
            {gamePhase === 'running' && (
              <text x={CX} y={CY} textAnchor="middle" dominantBaseline="middle"
                fill="#ffffff" fontSize="12" fontWeight="900"
                style={{ userSelect: 'none' }}>{gameCountdown}</text>
            )}
            {/* Result — trophy */}
            {(gamePhase === 'result' || gamePhase === 'naming') && (
              <text x={CX} y={CY} textAnchor="middle" dominantBaseline="middle"
                fontSize="13" style={{ userSelect: 'none' }}>🏆</text>
            )}
          </g>
        </svg>

        {/* ── Naming Overlay ── */}
        {gamePhase === 'naming' && (
          <div className="mm-naming-overlay">
            <div className="mm-naming-card">
              <div className="mm-naming-score" style={{ color: gamePeakTier.color }}>
                {Math.round(gamePeak * 100)}%
              </div>
              <div className="mm-tooltip-wrap">
                <div className="mm-naming-tier-row">
                  <span className="mm-naming-tier" style={{ color: gamePeakTier.color }}>
                    {namingEntry[namingGender]}
                  </span>
                  <span className="mm-naming-marvel-lbl" style={{ color: gamePeakTier.color }}>
                    — {gamePeakTier.name}
                  </span>
                </div>
                <div className="mm-tooltip">
                  {namingGender === 'female' ? namingEntry.fDesc : namingEntry.mDesc}
                </div>
              </div>
              <div className="mm-gender-row">
                <button className={`mm-gender-btn male${genderState === 'male' ? ' active' : ''}`}
                  onClick={() => setGender(g => g === 'male' ? null : 'male')} title="Male">♂</button>
                <span className="mm-gender-hint">{genderState === null ? '⚡ random' : genderState}</span>
                <button className={`mm-gender-btn female${genderState === 'female' ? ' active' : ''}`}
                  onClick={() => setGender(g => g === 'female' ? null : 'female')} title="Female">♀</button>
              </div>
              <p className="mm-naming-prompt">
                Enter your name or skip for "{namingEntry[namingGender]}"
              </p>
              <input className="mm-input mm-naming-input" type="text"
                placeholder={`${namingEntry.male} / ${namingEntry.female}`}
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && commitName(nameInput)}
                autoFocus maxLength={24} />
              <div className="mm-naming-actions">
                <button className="mm-btn primary" onClick={() => commitName(nameInput)}>Save</button>
                <button className="mm-btn" onClick={() => commitName('')}>Skip ({nameCountdown}s)</button>
              </div>
            </div>
          </div>
        )}

        {/* ── Result Flash ── */}
        {gamePhase === 'result' && (
          <div className="mm-result-flash" style={{ color: gamePeakTier.color }}>
            <span className="mm-result-score">{Math.round(gamePeak * 100)}%</span>
            <span className="mm-result-tier">{gamePeakTier.name.toUpperCase()}</span>
          </div>
        )}


      </div>
    </div>
  )
}
