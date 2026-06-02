import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  Zap, RotateCcw, Menu, ChevronLeft, Dumbbell,
  Timer, Activity, Trophy, FlaskConical, User,
} from 'lucide-react'
import './MuscleMeter.css'

// ── Marvel Strength Tiers ─────────────────────────────────────────────
const TIERS = [
  { id: 'starlord', name: 'Star-Lord',  color: '#9ca3af', min: 0,    max: 0.16, desc: 'Casual beginner strength — just getting started.' },
  { id: 'antman',   name: 'Ant-Man',    color: '#3b82f6', min: 0.16, max: 0.33, desc: 'Small but mighty — surprising bursts of power.' },
  { id: 'hulk',     name: 'Hulk',       color: '#22c55e', min: 0.33, max: 0.50, desc: "Raw, untamed strength — you're getting stronger." },
  { id: 'thor',     name: 'Thor',       color: '#eab308', min: 0.50, max: 0.66, desc: 'God-like power — lightning in your muscles.' },
  { id: 'ironman',  name: 'Iron Man',   color: '#ef4444', min: 0.66, max: 0.83, desc: 'Peak human performance — precision and power.' },
  { id: 'thanos',   name: 'Thanos',     color: '#a855f7', min: 0.83, max: 1.0,  desc: 'Infinite strength — you are the endgame.' },
]

// ── Leaderboard rank titles (position 0=1st … 9=10th) ────────────────
const RANK_MALE = [
  { title: 'Prime Titan',      desc: 'The absolute pinnacle of unstoppable power.' },
  { title: 'Apex Alpha',       desc: 'The dominant leader just below the ultimate crown.' },
  { title: 'Goliath Vanguard', desc: 'Massive force that leads the front lines.' },
  { title: 'Iron King',        desc: 'Heavy-lifting royalty ruling over the main pack.' },
  { title: 'Behemoth',         desc: 'Monstrously strong and incredibly difficult to topple.' },
  { title: 'Colossus',         desc: 'A towering pillar of pure, unshakeable muscle.' },
  { title: 'Juggernaut',       desc: 'Unstoppable momentum, crashing through standard limits.' },
  { title: 'Warlord',          desc: 'A battle-tested veteran fighting in the upper ranks.' },
  { title: 'Brawler',          desc: 'Gritty, aggressive, and working hard to climb higher.' },
  { title: 'Iron Recruit',     desc: 'The entry-level rank for fresh power.' },
]
const RANK_FEMALE = [
  { title: 'Prime Valkyrie',  desc: 'The ultimate, mythic warrior reigning at the absolute peak.' },
  { title: 'Amazonian Elite', desc: 'Unmatched, legendary strength just below the top spot.' },
  { title: 'Empress Force',   desc: 'Absolute royal authority backed by supreme power.' },
  { title: 'Alpha Huntress',  desc: 'Fierce, relentless competitor leading the main pack.' },
  { title: "Athena's Apex",   desc: 'Strategic perfection combined with heavy-lifting dominance.' },
  { title: 'Shieldmaiden',    desc: 'A gritty, resilient fighter holding a strong position.' },
  { title: 'Iron Queen',      desc: 'Elegant yet brutal power ruling the mid-tier.' },
  { title: 'Siren Strength',  desc: 'Deceptively powerful and dangerous to higher ranks.' },
  { title: 'She-Wolf',        desc: 'Wild, hungry, and aggressively climbing the ladder.' },
  { title: 'Steel Novice',    desc: 'The starting point where raw potential begins.' },
]
function getRank(position, gender) {
  const list = gender === 'female' ? RANK_FEMALE : RANK_MALE
  return list[Math.min(position, list.length - 1)]
}

function contrastColor(hex) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55 ? '#111111' : '#ffffff'
}

// ── Fixed female positions in leaderboard (0-indexed)
const FEMALE_POSITIONS = new Set([1, 4, 6, 9])

// ── Pre-configure strength levels (friendly names) ────────────────────
const STRENGTH_PRESETS = [
  { label: 'Easy',    value: 200,  desc: 'Light effort' },
  { label: 'Medium',  value: 500,  desc: 'Moderate effort' },
  { label: 'Hard',    value: 1000, desc: 'Strong effort' },
  { label: 'Pro',     value: 2000, desc: 'Very strong' },
  { label: 'Max',     value: 3500, desc: 'Maximum effort' },
]

// ── Gamma presets ────────────────────────────────────────────────────
const GAMMA_PRESETS = [
  { label: 'Soft',  value: 0.3 },
  { label: 'Medium',value: 0.6 },
  { label: 'Sharp', value: 1.0 },
  { label: 'Crisp', value: 1.5 },
  { label: 'Max',   value: 2.0 },
]

// ── Hold-boost constant — slowly increases reading while held ────────
const HOLD_BOOST = 0.0006

// SVG semicircle gauge parameters
const CX = 200, CY = 190, R = 160
const START_ANG = Math.PI
const END_ANG   = 2 * Math.PI
const TOTAL_ANG = END_ANG - START_ANG

function polarToXY(angle, radius = R) {
  return {
    x: CX + radius * Math.cos(angle),
    y: CY + radius * Math.sin(angle),
  }
}

function tierArc(tier) {
  const a0 = START_ANG + tier.min * TOTAL_ANG
  const a1 = START_ANG + tier.max * TOTAL_ANG
  const p0 = polarToXY(a0, R - 1)
  const p1 = polarToXY(a1, R - 1)
  const r0 = polarToXY(a0, R - 22)
  const r1 = polarToXY(a1, R - 22)
  const large = (tier.max - tier.min) > 0.5 ? 1 : 0
  return `M ${p0.x} ${p0.y} A ${R - 1} ${R - 1} 0 ${large} 1 ${p1.x} ${p1.y} L ${r1.x} ${r1.y} A ${R - 22} ${R - 22} 0 ${large} 0 ${r0.x} ${r0.y} Z`
}

function tierTextPath(tier) {
  const a0 = START_ANG + tier.min * TOTAL_ANG
  const a1 = START_ANG + tier.max * TOTAL_ANG
  const r = R - 12
  const p0 = polarToXY(a0, r)
  const p1 = polarToXY(a1, r)
  const large = (tier.max - tier.min) > 0.5 ? 1 : 0
  return `M ${p0.x} ${p0.y} A ${r} ${r} 0 ${large} 1 ${p1.x} ${p1.y}`
}

function tierOuterTextPath(tier) {
  const a0 = START_ANG + tier.min * TOTAL_ANG
  const a1 = START_ANG + tier.max * TOTAL_ANG
  const r = R + 5
  const p0 = polarToXY(a0, r)
  const p1 = polarToXY(a1, r)
  const large = (tier.max - tier.min) > 0.5 ? 1 : 0
  return `M ${p0.x} ${p0.y} A ${r} ${r} 0 ${large} 1 ${p1.x} ${p1.y}`
}

function needleAngle(pct) {
  return START_ANG + Math.max(0, Math.min(1, pct)) * TOTAL_ANG
}

const EMA_ALPHA = 0.04
const MVC_LS_KEY = 'emglab_mvc_rms'
const ENV_BUF_SIZE = 64

export default function MuscleMeter({
  rmsHistoryRef, rmsHeadRef, latestRmsRef, latestLabelRef,
  wsEvent, wsMessage,
  activeTab, onTabChange, tabs
}) {
  // ── Core state ───────────────────────────────────────────────────────
  const [displayPct, setDisplayPct] = useState(0)
  const [activeTier, setActiveTier] = useState(TIERS[0])
  const [mvc, setMvc] = useState(() => {
    const v = parseFloat(localStorage.getItem(MVC_LS_KEY))
    return isNaN(v) || v <= 0 ? null : v
  })
  const [isCalibrating, setIsCalibrating] = useState(false)
  const [calibProgress, setCalibProgress] = useState(0)
  const [peakRms, setPeakRms] = useState(0)
  const smoothRef = useRef(0)
  const animRef   = useRef(null)
  const autoCeilRef = useRef(1)

  // Raw EMG envelope
  const envBufRef   = useRef(new Float32Array(ENV_BUF_SIZE).fill(0))
  const envIdxRef   = useRef(0)
  const envSumRef   = useRef(0)
  const strengthRef = useRef(0)

  // ── Sidebar state ────────────────────────────────────────────────────
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  // ── Max strength state ───────────────────────────────────────────────
  const [maxStrengthInput, setMaxStrengthInput] = useState(
    mvc ? String(Math.round(mvc)) : ''
  )
  const [selectedPreset, setSelectedPreset] = useState(null)

  // ── Gamma state ──────────────────────────────────────────────────────
  const [gamma, setGamma] = useState(0.6)
  const [selectedGammaPreset, setSelectedGammaPreset] = useState('Medium')

  // ── Timer / countdown ────────────────────────────────────────────────
  const [gameCountdown, setGameCountdown] = useState(0)
  const [timerRunning, setTimerRunning] = useState(false)
  const timerRef = useRef(null)
  const timerStartRef = useRef(0)
  const timerRunningRef = useRef(false)

  // ── Result popup ─────────────────────────────────────────────────────
  const [resultPopup, setResultPopup] = useState(null)

  // ── Leaderboard ──────────────────────────────────────────────────────
  const [leaderboard, setLeaderboard] = useState(() => {
    try { return JSON.parse(localStorage.getItem('mm_leaderboard') || '[]') }
    catch { return [] }
  })
  const [hoveredLeaderEntry, setHoveredLeaderEntry] = useState(null)
  const peakDuringTimerRef = useRef(0)
  const holdTimeRef        = useRef(0)
  const holdTierRef        = useRef(null)

  // ── Timer + result input state ───────────────────────────────────────
  const [selectedTimerSec, setSelectedTimerSec] = useState(10)
  const [knobPressed, setKnobPressed]           = useState(false)
  const [resultName, setResultName]             = useState('')
  const [resultGender, setResultGender]         = useState('male')
  const [nameSaved, setNameSaved]               = useState(false)

  // ── Animation loop ───────────────────────────────────────────────────
  const tick = useCallback(() => {
    const base = strengthRef.current > 0 ? strengthRef.current : (latestRmsRef.current ?? 0)
    const ceil = mvc ?? (autoCeilRef.current > 1 ? autoCeilRef.current : null)

    // Hold-boost: accumulate only while signal stays within the same tier
    if (base > 0 && ceil) {
      const basePct  = Math.min(base / ceil, 1)
      const baseTier = TIERS.find(t => basePct >= t.min && basePct < t.max) || TIERS[TIERS.length - 1]
      if (holdTierRef.current === baseTier.id) {
        holdTimeRef.current += 1
      } else {
        holdTimeRef.current = 0
        holdTierRef.current = baseTier.id
      }
    } else {
      holdTimeRef.current = 0
    }
    const raw = base * (1 + HOLD_BOOST * holdTimeRef.current)

    const pct = ceil ? Math.min(raw / ceil, 1) : 0

    smoothRef.current = smoothRef.current + EMA_ALPHA * (pct - smoothRef.current)
    const sp = smoothRef.current

    const tier = TIERS.find(t => sp >= t.min && sp < t.max) || TIERS[TIERS.length - 1]
    setDisplayPct(sp)
    setActiveTier(tier)

    setPeakRms(p => Math.max(p, raw))
    if (!mvc && raw > 0) autoCeilRef.current = Math.max(autoCeilRef.current, raw * 1.3)

    animRef.current = requestAnimationFrame(tick)
  }, [mvc, latestRmsRef])

  useEffect(() => {
    animRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animRef.current)
  }, [tick])

  // ── Raw EMG envelope from bio_data_batch with gamma correction ───────
  useEffect(() => {
    if (!wsMessage) return
    const batch = wsMessage.raw?._batch
    if (!batch?.length) return

    batch.forEach(sample => {
      const channels = sample.channels || {}
      for (const chData of Object.values(channels)) {
        if ((chData.type || '').toUpperCase() === 'EMG') {
          const absVal = Math.abs(chData.value)
          const buf = envBufRef.current
          const idx = envIdxRef.current % buf.length
          envSumRef.current -= buf[idx]
          envSumRef.current += absVal
          buf[idx] = absVal
          envIdxRef.current++
          // Apply gamma correction
          const mav = (envSumRef.current / buf.length) * 2
          strengthRef.current = Math.pow(mav / (mav + 1), gamma) * (mav + 1) - 1
          break
        }
      }
    })
  }, [wsMessage, gamma])

  // ── MVC Calibration ──────────────────────────────────────────────────
  useEffect(() => {
    if (!isCalibrating) return
    const start = performance.now()
    const duration = 3000
    let localPeak = 0
    let raf

    function calibTick(now) {
      const elapsed = now - start
      setCalibProgress(Math.min(elapsed / duration, 1))
      const r = strengthRef.current > 0 ? strengthRef.current : (latestRmsRef.current ?? 0)
      if (r > localPeak) localPeak = r

      if (elapsed < duration) {
        raf = requestAnimationFrame(calibTick)
      } else {
        setIsCalibrating(false)
        setCalibProgress(0)
        if (localPeak > 0) {
          setMvc(localPeak)
          setMaxStrengthInput(String(Math.round(localPeak)))
          localStorage.setItem(MVC_LS_KEY, String(localPeak))
        }
      }
    }
    raf = requestAnimationFrame(calibTick)
    return () => cancelAnimationFrame(raf)
  }, [isCalibrating, latestRmsRef])

  // ── Timer controls ──────────────────────────────────────────────────
  const startTimer = useCallback((seconds = 10) => {
    if (timerRunningRef.current) return
    timerRunningRef.current = true
    timerStartRef.current = performance.now()
    peakDuringTimerRef.current = 0
    setGameCountdown(seconds)
    setTimerRunning(true)
    timerRef.current = setInterval(() => {
      const elapsed = (performance.now() - timerStartRef.current) / 1000
      const remaining = Math.max(0, seconds - elapsed)
      // Track peak during timer
      const currentStr = strengthRef.current > 0 ? strengthRef.current : (latestRmsRef.current ?? 0)
      if (currentStr > peakDuringTimerRef.current) peakDuringTimerRef.current = currentStr
      setGameCountdown(remaining)
      if (remaining <= 0) {
        clearInterval(timerRef.current)
        timerRunningRef.current = false
        setTimerRunning(false)
        setGameCountdown(0)
        // Save result to leaderboard & show popup
        const peak = peakDuringTimerRef.current
        const pct  = mvc ? Math.min(peak / mvc, 1) : 0
        const tier = TIERS.find(t => pct >= t.min && pct < t.max) || TIERS[TIERS.length - 1]
        setResultName('')
        setResultGender('male')
        setNameSaved(false)
        setResultPopup({ strength: peak, pct, tier: tier.id, tierName: tier.name })
      }
    }, 100)
  }, [mvc])

  const stopTimer = useCallback(() => {
    clearInterval(timerRef.current)
    timerRunningRef.current = false
    setTimerRunning(false)
    setGameCountdown(0)
  }, [])

  useEffect(() => () => {
    clearInterval(timerRef.current)
    timerRunningRef.current = false
  }, [])

  // ── Apply max strength ───────────────────────────────────────────────
  const applyMaxStrength = useCallback((value) => {
    const num = parseFloat(value)
    if (!isNaN(num) && num > 0) {
      setMvc(num)
      localStorage.setItem(MVC_LS_KEY, String(num))
      setMaxStrengthInput(String(Math.round(num)))
    }
  }, [])

  const applyPreset = useCallback((preset) => {
    setSelectedPreset(preset.label)
    applyMaxStrength(preset.value)
  }, [applyMaxStrength])

  // ── Apply gamma preset ───────────────────────────────────────────────
  const applyGammaPreset = useCallback((preset) => {
    setSelectedGammaPreset(preset.label)
    setGamma(preset.value)
  }, [])

  // ── Leaderboard ──────────────────────────────────────────────────────
  const saveToLeaderboard = useCallback(() => {
    const currentStr = strengthRef.current > 0 ? strengthRef.current : (latestRmsRef.current ?? 0)
    setLeaderboard(prev => {
      const pos = prev.filter(e => e.strength > currentStr).length
      const entry = {
        id: Date.now(),
        name: getRank(Math.min(pos, 9), 'male').title,
        gender: 'male',
        strength: currentStr,
        tier: activeTier.id,
        tierName: activeTier.name,
        tierDesc: activeTier.desc,
        pct: displayPct,
        timestamp: Date.now(),
      }
      const updated = [...prev, entry].sort((a, b) => b.strength - a.strength).slice(0, 20)
      localStorage.setItem('mm_leaderboard', JSON.stringify(updated))
      return updated
    })
  }, [activeTier, displayPct, latestRmsRef])

  const closeResultPopup = useCallback(() => setResultPopup(null), [])

  const saveResultToLeaderboard = useCallback(() => {
    if (!resultPopup) return
    const tier = TIERS.find(t => t.id === resultPopup.tier) || TIERS[0]
    setLeaderboard(prev => {
      const predictedPos = prev.filter(e => e.strength > resultPopup.strength).length
      const autoName = resultName.trim() || getRank(Math.min(predictedPos, 9), resultGender).title
      const entry = {
        id: Date.now(),
        name: autoName,
        gender: resultGender,
        strength: resultPopup.strength,
        tier: resultPopup.tier,
        tierName: resultPopup.tierName,
        tierDesc: tier.desc,
        pct: resultPopup.pct,
        timestamp: Date.now(),
      }
      const updated = [...prev, entry].sort((a, b) => b.strength - a.strength).slice(0, 20)
      localStorage.setItem('mm_leaderboard', JSON.stringify(updated))
      return updated
    })
    setNameSaved(true)
    setTimeout(() => setResultPopup(null), 1500)
  }, [resultPopup, resultName, resultGender])

  const clearLeaderboard = useCallback(() => {
    setLeaderboard([])
    localStorage.removeItem('mm_leaderboard')
  }, [])

  // ── Needle geometry ──────────────────────────────────────────────────
  const ang = needleAngle(displayPct)
  const tipLen = R - 36
  const needleTip   = polarToXY(ang, tipLen)
  const needleBase  = polarToXY(ang + Math.PI * 0.05, 12)
  const needleBase2 = polarToXY(ang - Math.PI * 0.05, 12)

  const currentStrength = strengthRef.current > 0
    ? strengthRef.current
    : (latestRmsRef.current ?? 0)

  // ── Active-tier band arc for curved emoji + strength label ────────────
  const bandR        = R - 11
  const a0Active     = START_ANG + activeTier.min * TOTAL_ANG
  const a1Active     = START_ANG + activeTier.max * TOTAL_ANG
  const bandArcStart = polarToXY(a0Active, bandR)
  const bandArcEnd   = polarToXY(a1Active, bandR)
  const bandArcLarge = (activeTier.max - activeTier.min) > 0.5 ? 1 : 0
  const bandArcPath  = `M ${bandArcStart.x} ${bandArcStart.y} A ${bandR} ${bandR} 0 ${bandArcLarge} 1 ${bandArcEnd.x} ${bandArcEnd.y}`

  // Emojis flanking near arc midpoint, rotated to follow the curve
  const midAng    = (a0Active + a1Active) / 2
  const emojiGap  = 0.14
  const emojiLAng = midAng - emojiGap
  const emojiRAng = midAng + emojiGap
  const emojiLPos = polarToXY(emojiLAng, bandR)
  const emojiRPos = polarToXY(emojiRAng, bandR)
  const leftRot   = 90 + emojiLAng * (180 / Math.PI)
  const rightRot  = -(90 + emojiRAng * (180 / Math.PI))

  // ────────────────────────────────────────────────────────────────────
  return (
    <div className="overflow-hidden relative h-full flex flex-row w-full" style={{ background: 'var(--bg)' }}>
      {/* ══ LEFT SIDEBAR ═══════════════════════════════════════════════ */}
      <div className={`order-1 transition-all duration-300 ease-in-out border-r border-border bg-surface/80 backdrop-blur-md flex flex-col h-full relative [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] ${!sidebarCollapsed ? 'w-80 overflow-y-auto overflow-x-hidden' : 'w-[4.5rem] overflow-visible'}`}>

        {/* ── Collapsed icon strip ────────────────────────────────────── */}
        {sidebarCollapsed && (
          <div className="flex flex-col items-center gap-4 w-full shrink-0 h-full relative">
            <button onClick={() => setSidebarCollapsed(false)} className="hover:bg-white/10 rounded-full transition-colors mt-6 p-1" title="Expand Sidebar">
              <Menu size={34} className="text-primary" />
            </button>
            <hr className="w-[4rem] border-border" />

            <button onClick={() => setSidebarCollapsed(false)} className="hover:text-primary transition-colors group relative" title="Max Strength">
              <Dumbbell size={28} className="text-primary animate-pulse" />
              <div className="absolute left-14 top-1/2 -translate-y-1/2 bg-surface border border-border px-3 py-1.5 rounded-lg text-xs font-bold text-text whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">Max Strength</div>
            </button>

            <button onClick={() => setSidebarCollapsed(false)} className="hover:text-primary transition-colors group relative mt-4" title="Gamma Correction">
              <FlaskConical size={28} className="text-muted group-hover:text-primary" />
              <div className="absolute left-14 top-1/2 -translate-y-1/2 bg-surface border border-border px-3 py-1.5 rounded-lg text-xs font-bold text-text whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">Gamma Correction</div>
            </button>


            <button onClick={() => setSidebarCollapsed(false)} className="hover:text-primary transition-colors group relative mt-4" title="Live Stats">
              <Activity size={28} className="text-muted group-hover:text-primary" />
              <div className="absolute left-14 top-1/2 -translate-y-1/2 bg-surface border border-border px-3 py-1.5 rounded-lg text-xs font-bold text-text whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">Live Stats</div>
            </button>

            <div className="flex-1" />

            <div className="flex flex-col items-center gap-1 pb-4 border-t border-border pt-4 w-full">
              <span className="text-sm font-black text-primary font-mono">{currentStrength.toFixed(0)}</span>
              <span className="text-[9px] text-muted uppercase tracking-wider">µV</span>
            </div>
          </div>
        )}

        {/* ── Expanded sidebar ─────────────────────────────────────────── */}
        <div className={`flex-grow flex flex-col p-4 gap-4 font-mono transition-opacity duration-300 min-w-[320px] w-80 shrink-0 ${sidebarCollapsed ? 'opacity-0 h-0 hidden' : 'opacity-100'}`}>
          {/* Header */}
          <div className="flex items-center justify-between shrink-0 mb-2">
            <div>
              <h2 className="text-2xl font-bold text-text mb-1 pt-2.5 flex items-center gap-3">
                <Dumbbell size={28} className="text-primary animate-pulse" />
                <span style={{ letterSpacing: '2.3px' }}>Muscle Meter</span>
              </h2>
              <p className="text-xs text-muted">Real-time Strength Gauge</p>
            </div>
            <button onClick={() => setSidebarCollapsed(true)} className="p-2 hover:bg-white/10 rounded-full transition-colors" title="Collapse Sidebar">
              <ChevronLeft size={36} />
            </button>
          </div>

          {/* ── 1. Live Stats ── (TOP, increased font) ──────────────────── */}
          <div className="flex flex-col gap-3 shrink-0 bg-bg/30 p-4 rounded-xl border border-border/50">
            <label className="text-base font-bold text-primary uppercase tracking-widest flex items-center gap-2">
              <Activity size={20} className="text-primary" /> Live Stats
            </label>
            <div className="flex flex-col gap-1">
              {[
                { label: 'Strength', value: `${currentStrength.toFixed(1)} µV`, color: null },
                { label: 'Peak',     value: `${peakRms.toFixed(1)} µV`,         color: null },
                { label: 'Max %',    value: `${Math.round(displayPct * 100)}%`,  color: activeTier.color },
                { label: 'Tier',     value: activeTier.name.toUpperCase(),       color: activeTier.color },
              ].map(stat => (
                <div key={stat.label} className="flex justify-between items-center py-2 border-b border-white/5 last:border-0">
                  <span className="text-sm text-muted uppercase tracking-wider">{stat.label}</span>
                  <span className="text-sm font-black font-mono" style={{ color: stat.color || 'var(--text)' }}>{stat.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── 2. Leaderboard ───────────────────────────────────────────── */}
          <div className="w-full flex flex-col bg-surface/30 border border-text/40 rounded-2xl p-3 backdrop-blur-md shadow-2xl shrink-0">
            <div className="text-base font-bold text-muted uppercase tracking-wider mb-3 flex justify-between items-center pb-3 border-b border-text/40 flex-shrink-0">
              <span className="flex items-center gap-2"><Trophy size={14} className="text-primary" /> Leaderboard</span>
              <button
                onClick={saveToLeaderboard}
                className="flex items-center gap-1 px-2 py-1 rounded-lg border border-primary/50 bg-primary/10 text-primary text-[10px] font-bold hover:bg-primary/20 transition-colors"
                title="Save current reading"
              >
                <Zap size={10} /> Save
              </button>
            </div>
            <div className="font-mono text-sm">
              {Array.from({ length: 10 }, (_, i) => {
                const entry    = leaderboard[i]
                const isFemale = entry ? entry.gender === 'female' : FEMALE_POSITIONS.has(i)
                const rank     = getRank(i, isFemale ? 'female' : 'male')
                const tierObj  = entry ? TIERS.find(t => t.id === entry.tier) : null
                const tierColor = tierObj?.color || null
                return (
                  <div key={i} className="relative">
                    <div
                      onMouseEnter={() => entry && setHoveredLeaderEntry(entry.id)}
                      onMouseLeave={() => setHoveredLeaderEntry(null)}
                      className={`flex items-center gap-1.5 py-1.5 border-b border-white/5 last:border-0 px-1.5 rounded transition-colors ${entry ? 'hover:bg-white/5 cursor-default' : 'opacity-25'}`}
                    >
                      <span className="font-black text-muted text-xs w-5 text-right flex-shrink-0">{i + 1}</span>
                      <User size={13} className="flex-shrink-0" style={{ color: tierColor || (isFemale ? '#ec4899' : 'var(--muted)') }} />
                      <span className="flex-1 font-bold text-xs truncate min-w-0" style={{ color: tierColor || 'var(--muted)' }}>
                        {rank.title}
                      </span>
                      {entry && (
                        <>
                          <span className="text-[10px] text-muted/50 whitespace-nowrap flex-shrink-0">· {tierObj?.name}</span>
                          <span className="font-mono text-xs font-semibold whitespace-nowrap flex-shrink-0 ml-1" style={{ color: tierColor }}>
                            {entry.strength.toFixed(0)} µV
                          </span>
                        </>
                      )}
                    </div>
                    {entry && (
                      <div
                        className="overflow-hidden"
                        style={{
                          maxHeight: hoveredLeaderEntry === entry.id ? '160px' : '0px',
                          opacity:   hoveredLeaderEntry === entry.id ? 1 : 0,
                          transition: 'max-height 0.24s ease-out, opacity 0.2s ease-out',
                        }}
                      >
                        <div className="mx-1 bg-bg border border-border/60 rounded-xl p-2.5 mt-0.5 mb-0.5">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <span className="font-black text-text text-xs leading-tight">
                              {entry.name !== rank.title ? entry.name : ''}
                            </span>
                            <span className="font-mono font-bold text-xs whitespace-nowrap ml-auto" style={{ color: tierObj?.color }}>
                              {entry.strength.toFixed(0)} µV
                            </span>
                          </div>
                          <div className="text-[10px] font-bold text-muted/70 uppercase tracking-wide mb-1">
                            {i + 1}. {rank.title}
                          </div>
                          <div className="text-[10px] text-muted/60 italic leading-relaxed">
                            {rank.desc}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            {leaderboard.length > 0 && (
              <button onClick={clearLeaderboard} className="mt-2 w-full py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 text-[10px] font-bold uppercase tracking-widest hover:bg-red-500/20 transition-colors flex-shrink-0">
                Clear All
              </button>
            )}
          </div>

          {/* ── 3. Max Strength ─────────────────────────────────────────── */}
          <div className="flex flex-col gap-3 shrink-0 bg-bg/30 p-3 rounded-xl border border-border/50">
            <label className="text-sm font-bold text-muted uppercase tracking-widest flex items-center gap-2 mb-1">
              <Dumbbell size={16} className="text-primary" /> Max Strength (µV)
            </label>
            <div className="flex flex-wrap gap-1.5">
              {STRENGTH_PRESETS.map(p => (
                <button
                  key={p.label}
                  onClick={() => applyPreset(p)}
                  title={p.desc}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${
                    selectedPreset === p.label
                      ? 'bg-primary/20 border-primary text-primary'
                      : 'bg-surface border-border text-muted hover:border-primary hover:text-text'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2 items-center pt-1 border-t border-border/30">
              <input
                type="number"
                placeholder="Custom µV..."
                value={maxStrengthInput}
                onChange={e => setMaxStrengthInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') applyMaxStrength(maxStrengthInput) }}
                min={1}
                step={10}
                className="flex-1 px-3 py-1.5 rounded-lg border border-border bg-surface text-text text-xs font-bold outline-none focus:border-primary transition-colors"
              />
              <button
                onClick={() => applyMaxStrength(maxStrengthInput)}
                className="px-3 py-1.5 rounded-lg border border-primary/50 bg-primary/10 text-primary text-xs font-bold hover:bg-primary/20 transition-colors whitespace-nowrap"
              >
                Set
              </button>
            </div>
            {mvc && (
              <div className="flex justify-between items-center px-1">
                <span className="text-xs text-muted uppercase tracking-wider">Current Max</span>
                <span className="text-xs font-black text-green-400 font-mono">{mvc.toFixed(0)} µV</span>
              </div>
            )}
          </div>

          {/* ── 4. Gamma Correction ──────────────────────────────────────── */}
          <div className="flex flex-col gap-3 shrink-0 bg-bg/30 p-3 rounded-xl border border-border/50">
            <label className="text-sm font-bold text-muted uppercase tracking-widest flex items-center gap-2 mb-1">
              <FlaskConical size={16} className="text-primary" /> Gamma Correction
            </label>
            <div className="flex flex-wrap gap-1.5">
              {GAMMA_PRESETS.map(p => (
                <button
                  key={p.label}
                  onClick={() => applyGammaPreset(p)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${
                    selectedGammaPreset === p.label
                      ? 'bg-primary/20 border-primary text-primary'
                      : 'bg-surface border-border text-muted hover:border-primary hover:text-text'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <input
              type="range"
              min={0.1} max={3.0} step={0.05}
              value={gamma}
              onChange={e => { setGamma(parseFloat(e.target.value)); setSelectedGammaPreset('Custom') }}
              className="w-full accent-primary"
            />
            <div className="flex justify-between items-center px-1">
              <span className="text-xs text-muted uppercase tracking-wider">Sensitivity</span>
              <span className="text-xs font-black text-primary font-mono">γ = {gamma.toFixed(2)}</span>
            </div>
          </div>

          {/* ── 5. Timer ─────────────────────────────────────────────────── */}
          <div className="flex flex-col gap-3 shrink-0 bg-bg/30 p-3 rounded-xl border border-border/50">
            <label className="text-sm font-bold text-muted uppercase tracking-widest flex items-center gap-2 mb-1">
              <Timer size={16} className="text-primary" /> Timer
            </label>
            <p className="text-[10px] text-muted/70 italic mb-1">Select duration, then click the knob to start.</p>
            <div className="flex gap-1.5 flex-wrap">
              {[5, 10, 15, 30, 60].map(sec => (
                <button
                  key={sec}
                  onClick={() => setSelectedTimerSec(sec)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${
                    selectedTimerSec === sec
                      ? 'bg-primary/20 border-primary text-primary'
                      : 'bg-surface border-border text-muted hover:border-primary hover:text-text'
                  }`}
                >
                  {sec}s
                </button>
              ))}
              <button
                onClick={stopTimer}
                disabled={!timerRunning}
                className="px-3 py-1.5 rounded-lg border border-red-500/40 bg-red-500/10 text-red-400 text-xs font-bold hover:bg-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                Stop
              </button>
            </div>
            {timerRunning && (
              <div className="flex justify-between items-center px-1">
                <span className="text-xs text-muted uppercase tracking-wider">Remaining</span>
                <span className="text-sm font-black text-blue-400 font-mono">{gameCountdown.toFixed(1)}s</span>
              </div>
            )}
          </div>

          {/* ── 6. Calibrate / Reset ─────────────────────────────────────── */}
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => setIsCalibrating(true)}
              disabled={isCalibrating}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-primary/50 bg-primary/10 text-primary font-bold text-xs uppercase tracking-widest hover:bg-primary/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              <Zap size={14} />
              {isCalibrating ? 'Calibrating...' : 'Calibrate MVC'}
            </button>
            <button
              onClick={() => {
                setMvc(null); setSelectedPreset(null); setMaxStrengthInput('')
                localStorage.removeItem(MVC_LS_KEY); setPeakRms(0)
                autoCeilRef.current = 1; strengthRef.current = 0
                envSumRef.current = 0; envBufRef.current.fill(0); envIdxRef.current = 0
              }}
              className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-border bg-surface text-muted font-bold text-xs uppercase tracking-widest hover:border-primary hover:text-text transition-all"
            >
              <RotateCcw size={14} />
              Reset
            </button>
          </div>

          {isCalibrating && (
            <div className="relative h-6 rounded-full overflow-hidden border border-border shrink-0" style={{ background: 'var(--surface)' }}>
              <div className="h-full rounded-full transition-all duration-100" style={{ width: `${calibProgress * 100}%`, background: 'linear-gradient(90deg, var(--primary), var(--accent))' }} />
              <span className="absolute inset-0 flex items-center justify-center text-[10px] font-black uppercase tracking-widest mix-blend-difference" style={{ color: 'var(--text)' }}>
                MAX CONTRACTION — {Math.round((1 - calibProgress) * 3)}s
              </span>
            </div>
          )}


        </div>
      </div>

      {/* ══ MAIN GAUGE AREA ═══════════════════════════════════════════ */}
      <div className="order-2 flex-1 flex flex-col items-center justify-center h-full overflow-hidden relative">
        <svg
          viewBox="0 0 400 215"
          className="w-full h-full block"
          style={{ maxHeight: '100%', maxWidth: '100%' }}
          preserveAspectRatio="xMidYMid meet"
          overflow="visible"
        >
          <defs>
            <filter id="mm-glow">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <radialGradient id="knob-grad" cx="40%" cy="35%" r="60%">
              <stop offset="0%" stopColor="#555" />
              <stop offset="50%" stopColor="#2a2a2a" />
              <stop offset="100%" stopColor="#111" />
            </radialGradient>
            <path id="mm-band-arc" d={bandArcPath} />
          </defs>

          {/* Tier arcs */}
          {TIERS.map(tier => (
            <path
              key={tier.id}
              d={tierArc(tier)}
              fill={tier.color}
              opacity={activeTier.id === tier.id ? 0.95 : 0.22}
              filter={activeTier.id === tier.id ? 'url(#mm-glow)' : undefined}
              style={{ transition: 'opacity 0.25s ease' }}
            />
          ))}

          {/* Inactive tier labels */}
          {TIERS.filter(t => t.id !== activeTier.id).map(tier => {
            const midAng = START_ANG + (tier.min + tier.max) / 2 * TOTAL_ANG
            const pid = `mm-tp-${tier.id}`
            return (
              <g key={`label-${tier.id}`}>
                <defs><path id={pid} d={tierTextPath(tier)} /></defs>
                <text fill={tier.color} fontSize="8.5" fontWeight="800" textAnchor="middle" letterSpacing="0.5" opacity="0.75"
                  style={{ filter: `drop-shadow(0 0 3px ${tier.color})` }}>
                  <textPath href={`#${pid}`} startOffset="50%" side={midAng > Math.PI * 1.5 ? 'right' : 'left'}>
                    {tier.name.toUpperCase()}
                  </textPath>
                </text>
              </g>
            )
          })}

          {/* Active tier label — outer arc */}
          {(() => {
            const midAng = START_ANG + (activeTier.min + activeTier.max) / 2 * TOTAL_ANG
            const pid = `mm-tp-outer-${activeTier.id}`
            return (
              <g>
                <defs><path id={pid} d={tierOuterTextPath(activeTier)} /></defs>
                <text fill={activeTier.color} fontSize="10" fontWeight="900" textAnchor="middle" letterSpacing="0.8"
                  style={{ transition: 'fill 0.25s ease' }}>
                  <textPath href={`#${pid}`} startOffset="50%" side={midAng > Math.PI * 1.5 ? 'right' : 'left'}>
                    {activeTier.name.toUpperCase()}
                  </textPath>
                </text>
              </g>
            )
          })()}

          {/* Track outline */}
          <path
            d={`M ${polarToXY(START_ANG).x} ${polarToXY(START_ANG).y} A ${R} ${R} 0 0 1 ${polarToXY(END_ANG).x} ${polarToXY(END_ANG).y}`}
            fill="none" stroke="var(--border)" strokeWidth="1"
          />

          {/* Tick marks at tier boundaries */}
          {TIERS.map((tier, i) => {
            if (i === 0) return null
            const a = START_ANG + tier.min * TOTAL_ANG
            const outer = polarToXY(a, R + 4)
            const inner = polarToXY(a, R - 28)
            return <line key={tier.id} x1={outer.x} y1={outer.y} x2={inner.x} y2={inner.y} stroke="var(--border)" strokeWidth="1.5" />
          })}

          {/* Needle */}
          <polygon
            points={`${needleTip.x},${needleTip.y} ${needleBase.x},${needleBase.y} ${needleBase2.x},${needleBase2.y}`}
            fill={activeTier.color}
            filter="url(#mm-glow)"
          />

          {/* 💪 flanking strength along curve */}
          <g transform={`rotate(${leftRot.toFixed(2)}, ${emojiLPos.x.toFixed(2)}, ${emojiLPos.y.toFixed(2)})`}>
            <text x={emojiLPos.x} y={emojiLPos.y} textAnchor="middle" dominantBaseline="central"
              fontSize="11" style={{ userSelect: 'none' }}>💪</text>
          </g>

          {/* Curved strength value along active arc */}
          <text fontWeight="900" textAnchor="middle"
            style={{
              transition: 'fill 0.3s ease',
              fill: contrastColor(activeTier.color),
              fontSize: '9px',
              filter: `drop-shadow(0 0 4px ${activeTier.color}cc)`,
            }}>
            <textPath href="#mm-band-arc" startOffset="50%">
              {currentStrength.toFixed(0)} µV
            </textPath>
          </text>

          {/* 💪 mirrored */}
          <g transform={`translate(${emojiRPos.x.toFixed(2)},${emojiRPos.y.toFixed(2)}) scale(-1,1) rotate(${rightRot.toFixed(2)}) translate(${(-emojiRPos.x).toFixed(2)},${(-emojiRPos.y).toFixed(2)})`}>
            <text x={emojiRPos.x} y={emojiRPos.y} textAnchor="middle" dominantBaseline="central"
              fontSize="11" style={{ userSelect: 'none' }}>💪</text>
          </g>

          {/* 3D Knob Button — click starts/stops timer */}
          <g
            style={{
              cursor: 'pointer',
              transform: `scale(${knobPressed ? 0.88 : 1})`,
              transformOrigin: `${CX}px ${CY}px`,
              transition: 'transform 0.1s ease',
            }}
            onClick={() => { if (!timerRunning) startTimer(selectedTimerSec); else stopTimer() }}
            onMouseDown={() => setKnobPressed(true)}
            onMouseUp={() => setKnobPressed(false)}
            onMouseLeave={() => setKnobPressed(false)}
          >
            {/* Main knob face */}
            <circle cx={CX} cy={CY} r={15} fill="url(#knob-grad)" stroke={activeTier.color} strokeWidth="1.5" />
            {/* Highlight / shine */}
            <ellipse cx={CX - 4} cy={CY - 5} rx={6} ry={3.5} fill="white" opacity="0.15" transform={`rotate(-30, ${CX - 4}, ${CY - 5})`} />
            {/* Tiny specular dot */}
            <circle cx={CX - 3} cy={CY - 6} r={1.5} fill="white" opacity="0.25" />

            {/* Knob label: START before timer, % during timer */}
            <text x={CX} y={timerRunning ? CY - 5 : CY} textAnchor="middle" dominantBaseline="central"
              fill={timerRunning ? activeTier.color : 'var(--muted)'} fontSize={timerRunning ? '11' : '8'} fontWeight="900"
              style={{ transition: 'all 0.3s ease' }}>
              {timerRunning ? `${Math.round(displayPct * 100)}%` : 'START'}
            </text>

            {/* Timer countdown below % (inside knob) */}
            {timerRunning && (
              <text x={CX} y={CY + 9} textAnchor="middle" dominantBaseline="central"
                fill="#60a5fa" fontSize="7" fontWeight="800"
                style={{ fontVariantNumeric: 'tabular-nums' }}>
                {gameCountdown.toFixed(1)}s
              </text>
            )}

            {/* Tooltip hint */}
            <title>{timerRunning ? 'Click to stop timer' : `Click to start ${selectedTimerSec}s timer`}</title>
          </g>
        </svg>
      </div>

      {/* ══ RESULT POPUP ════════════════════════════════════════════════ */}
      {resultPopup && (() => {
        const tier = TIERS.find(t => t.id === resultPopup.tier) || TIERS[0]
        return (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-surface border border-border/80 rounded-2xl p-8 max-w-sm w-full mx-6 shadow-2xl" style={{ borderColor: `${tier.color}40` }}>
              {nameSaved ? (
                <div className="text-center py-10">
                  <div className="text-6xl mb-4">🏆</div>
                  <div className="text-xl font-black text-text uppercase tracking-widest">Saved!</div>
                </div>
              ) : (
                <>
                  {/* Header */}
                  <div className="text-center mb-5">
                    <div className="text-5xl mb-3">💪</div>
                    <h3 className="text-xl font-black text-text uppercase tracking-widest">Timer Complete!</h3>
                  </div>

                  {/* Stats */}
                  <div className="space-y-2 mb-5">
                    <div className="flex justify-between items-center py-2 px-3 rounded-lg" style={{ background: `${tier.color}15` }}>
                      <span className="text-sm text-muted uppercase tracking-wider">Strength</span>
                      <span className="text-lg font-black font-mono" style={{ color: tier.color }}>{resultPopup.strength.toFixed(0)} µV</span>
                    </div>
                    <div className="flex justify-between items-center py-2 px-3 rounded-lg bg-bg/30">
                      <span className="text-sm text-muted uppercase tracking-wider">Tier</span>
                      <span className="text-sm font-black uppercase tracking-wide" style={{ color: tier.color }}>{tier.name}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 px-3 rounded-lg bg-bg/30">
                      <span className="text-sm text-muted uppercase tracking-wider">Max %</span>
                      <span className="text-lg font-black font-mono" style={{ color: tier.color }}>{Math.round(resultPopup.pct * 100)}%</span>
                    </div>
                    <div className="text-xs text-muted italic text-center pt-1">{tier.desc}</div>
                  </div>

                  {/* Name + gender input */}
                  <div className="flex flex-col gap-2 mb-5">
                    {(() => {
                      const predictedPos = leaderboard.filter(e => e.strength > resultPopup.strength).length
                      const predictedRank = getRank(Math.min(predictedPos, 9), resultGender)
                      return (
                        <input
                          type="text"
                          placeholder={predictedRank.title}
                          value={resultName}
                          onChange={e => setResultName(e.target.value)}
                          maxLength={32}
                          title={predictedRank.desc}
                          className="w-full px-3 py-2 rounded-lg border border-border bg-bg text-text text-sm outline-none focus:border-primary transition-colors"
                        />
                      )
                    })()}
                    <div className="flex gap-2">
                      <button
                        onClick={() => setResultGender('male')}
                        className={`flex-1 py-2 rounded-lg border text-sm font-bold transition-all ${
                          resultGender === 'male'
                            ? 'bg-blue-500/20 border-blue-500 text-blue-400'
                            : 'bg-surface border-border text-muted hover:border-primary hover:text-text'
                        }`}
                      >♂ Male</button>
                      <button
                        onClick={() => setResultGender('female')}
                        className={`flex-1 py-2 rounded-lg border text-sm font-bold transition-all ${
                          resultGender === 'female'
                            ? 'bg-pink-500/20 border-pink-500 text-pink-400'
                            : 'bg-surface border-border text-muted hover:border-primary hover:text-text'
                        }`}
                      >♀ Female</button>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-3">
                    <button
                      onClick={saveResultToLeaderboard}
                      className="flex-1 py-3 rounded-xl border border-primary/50 bg-primary/10 text-primary font-bold text-sm uppercase tracking-widest hover:bg-primary/20 transition-all"
                    >
                      Save 🏆
                    </button>
                    <button
                      onClick={closeResultPopup}
                      className="px-4 py-3 rounded-xl border border-border bg-surface text-muted font-bold text-sm uppercase tracking-widest hover:border-primary hover:text-text transition-all"
                    >
                      Dismiss
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )
      })()}

    </div>
  )
}
