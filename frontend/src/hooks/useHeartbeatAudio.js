/**
 * useHeartbeatAudio — plays a heartbeat thump sound on demand.
 *
 * Priority:
 *  1. Loads /sounds/heartbeat.mp3 if the file is present in public/.
 *  2. Falls back to a Web-Audio-API synthesised lub-dub.
 *
 * Usage:
 *   const { playBeat, prime } = useHeartbeatAudio(0.7)
 *   // call prime() on the first user interaction (needed for AudioContext policy)
 *   // call playBeat() every time a heartbeat should sound
 */
import { useRef, useCallback, useEffect } from 'react'

const MP3_PATH = '/sounds/heartbeat.mp3'

export function useHeartbeatAudio(volume = 0.7) {
  const ctxRef       = useRef(null)   // AudioContext
  const bufferRef    = useRef(null)   // decoded MP3 buffer (or null → use synth)
  const tryMp3Ref    = useRef(true)   // flip to false after first failed fetch
  const loadingRef   = useRef(false)

  // ── Build / reuse AudioContext ──────────────────────────────────────
  const getCtx = useCallback(() => {
    if (!ctxRef.current || ctxRef.current.state === 'closed') {
      try {
        ctxRef.current = new (window.AudioContext || window.webkitAudioContext)()
      } catch { return null }
    }
    if (ctxRef.current.state === 'suspended') {
      ctxRef.current.resume().catch(() => {})
    }
    return ctxRef.current
  }, [])

  // ── Try to load the MP3 (silently skips on 404) ─────────────────────
  const loadMp3 = useCallback(async () => {
    if (!tryMp3Ref.current || loadingRef.current || bufferRef.current) return
    loadingRef.current = true
    try {
      const res = await fetch(MP3_PATH)
      if (!res.ok) throw new Error('not found')
      const ab  = await res.arrayBuffer()
      const ctx = getCtx()
      if (!ctx) return
      bufferRef.current = await ctx.decodeAudioData(ab)
    } catch {
      tryMp3Ref.current = false  // MP3 absent — use synthesis from now on
    } finally {
      loadingRef.current = false
    }
  }, [getCtx])

  // ── Synthesise a realistic lub-dub with Web Audio API ───────────────
  const synthBeat = useCallback((ctx, startT, freq, dur, amp) => {
    const osc  = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type            = 'sine'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0,                   startT)
    gain.gain.linearRampToValueAtTime(amp * volume, startT + 0.006)
    gain.gain.exponentialRampToValueAtTime(0.0001,  startT + dur)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(startT)
    osc.stop(startT + dur)
  }, [volume])

  // ── Public: prime the AudioContext after a user gesture ─────────────
  const prime = useCallback(() => {
    getCtx()
    loadMp3()
  }, [getCtx, loadMp3])

  // ── Public: play one heartbeat ──────────────────────────────────────
  const playBeat = useCallback(() => {
    const ctx = getCtx()
    if (!ctx) return

    if (bufferRef.current) {
      // Play the MP3
      const src  = ctx.createBufferSource()
      src.buffer = bufferRef.current
      const g    = ctx.createGain()
      g.gain.value = Math.min(volume, 1)
      src.connect(g)
      g.connect(ctx.destination)
      src.start()
    } else {
      // Synthesised lub-dub fallback
      const now = ctx.currentTime
      synthBeat(ctx, now,        50, 0.13, 0.55)  // S1  lub  ~50 Hz
      synthBeat(ctx, now + 0.10, 75, 0.10, 0.38)  // S2  dub  ~75 Hz
    }

    // Attempt to load MP3 in the background for subsequent beats
    if (tryMp3Ref.current && !bufferRef.current) loadMp3()
  }, [getCtx, loadMp3, synthBeat, volume])

  // ── Cleanup on unmount ──────────────────────────────────────────────
  useEffect(() => {
    return () => {
      ctxRef.current?.close().catch(() => {})
      ctxRef.current = null
    }
  }, [])

  return { playBeat, prime }
}
