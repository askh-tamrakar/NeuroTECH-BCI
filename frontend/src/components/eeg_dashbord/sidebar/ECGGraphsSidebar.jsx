import React from 'react';
import {
  Activity, Brain, ChevronLeft, Heart,
  Pause, Play, Volume2, VolumeX, ZoomIn, ZoomOut,
} from 'lucide-react';

const BAND_COLORS = ['#4f8eff', '#a855f7', '#22c55e', '#00e5ff', '#f59e0b'];
const BAND_LABELS = ['Delta', 'Theta', 'Alpha', 'Beta', 'Gamma'];

const STATE_TEXT = {
  Focus: '#0ea5e9', Calm: '#a855f7', Relaxed: '#22c55e',
  Stressed: '#f43f5e', Drowsy: '#f59e0b', Neutral: '#94a3b8',
};

function bpmColor(bpm) {
  if (!bpm)      return 'var(--muted)';
  if (bpm < 60)  return '#3b82f6';
  if (bpm < 100) return '#22c55e';
  return '#ef4444';
}

export default function ECGGraphsSidebar({
  paused, onTogglePause,
  gainIdx, onGainDown, onGainUp, gainPresets,
  soundOn, onToggleSound,
  ecgMeta, bpmStats,
  onClear, onBackToMenu,
  mindState, bandPowers,
}) {
  const bColor   = bpmColor(ecgMeta?.bpm);
  const stColor  = STATE_TEXT[mindState?.state] || '#94a3b8';
  const bandTotal = Object.values(bandPowers || {}).reduce((a, b) => a + b, 0.001);

  return (
    <div className="flex h-full w-full flex-col p-4 font-mono gap-3 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:'none'] [&::-webkit-scrollbar]:hidden">

      {/* Back */}
      <button
        onClick={onBackToMenu}
        className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[2px] text-[var(--muted)] hover:text-[var(--text)] transition-colors"
      >
        <ChevronLeft size={14} /> Back to Menu
      </button>

      <div className="border-t border-[var(--border)]/30" />

      {/* ECG Controls */}
      <div>
        <p className="text-[9px] font-black text-[var(--muted)] uppercase tracking-[3px] px-1 mb-2">
          ECG Controls
        </p>
        <div className="flex flex-col gap-1.5">
          <button
            onClick={onTogglePause}
            className={`flex items-center gap-2 px-3 py-2.5 rounded-[14px] border transition-all text-[11px] font-black ${
              paused
                ? 'bg-green-500/10 border-green-500/30 text-green-400 hover:bg-green-500/20'
                : 'bg-[var(--bg)]/40 border-[var(--border)]/30 text-[var(--text)] hover:bg-[var(--surface)]/60'
            }`}
          >
            {paused ? <><Play size={14} /> Resume Stream</> : <><Pause size={14} /> Pause Stream</>}
          </button>

          <button
            onClick={onToggleSound}
            className="flex items-center gap-2 px-3 py-2.5 rounded-[14px] border border-[var(--border)]/30 bg-[var(--bg)]/40 text-[11px] font-black text-[var(--text)] hover:bg-[var(--surface)]/60 transition-all"
          >
            {soundOn ? <><Volume2 size={14} /> Heartbeat Sound</> : <><VolumeX size={14} /> Sound Off</>}
          </button>

          <button
            onClick={onClear}
            className="flex items-center gap-2 px-3 py-2.5 rounded-[14px] border border-[var(--border)]/30 bg-[var(--bg)]/40 text-[11px] font-black text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface)]/60 transition-all"
          >
            Clear Buffer
          </button>
        </div>
      </div>

      {/* Gain */}
      <div>
        <p className="text-[9px] font-black text-[var(--muted)] uppercase tracking-[3px] px-1 mb-2">ECG Gain</p>
        <div className="flex items-center gap-2">
          <button
            onClick={onGainDown} disabled={gainIdx === 0}
            className="p-2 rounded-lg border border-[var(--border)]/30 hover:bg-[var(--surface)]/60 disabled:opacity-30 text-[var(--text)] transition-all"
          >
            <ZoomOut size={14} />
          </button>
          <div className="flex flex-1 gap-1">
            {gainPresets.map((g, i) => (
              <div key={g}
                className={`flex-1 py-1.5 text-[9px] font-black rounded text-center border transition-all ${
                  i === gainIdx
                    ? 'bg-[var(--primary)]/15 border-[var(--primary)]/40 text-[var(--primary)]'
                    : 'bg-[var(--bg)]/40 border-[var(--border)]/20 text-[var(--muted)]'
                }`}>
                ×{g}
              </div>
            ))}
          </div>
          <button
            onClick={onGainUp} disabled={gainIdx === gainPresets.length - 1}
            className="p-2 rounded-lg border border-[var(--border)]/30 hover:bg-[var(--surface)]/60 disabled:opacity-30 text-[var(--text)] transition-all"
          >
            <ZoomIn size={14} />
          </button>
        </div>
      </div>

      <div className="border-t border-[var(--border)]/30" />

      {/* Heart Stats */}
      <div>
        <p className="text-[9px] font-black text-[var(--muted)] uppercase tracking-[3px] px-1 mb-2">
          <Heart size={10} className="inline mr-1 text-red-400" />Heart Stats
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          {[
            { label: 'BPM',       val: ecgMeta?.bpm     != null ? Math.round(ecgMeta.bpm)                : '—', color: bColor },
            { label: 'RR',        val: ecgMeta?.rr_ms   != null ? `${Math.round(ecgMeta.rr_ms)} ms`      : '—' },
            { label: 'HRV SDNN',  val: ecgMeta?.rr_sdnn != null ? `${Math.round(ecgMeta.rr_sdnn)} ms`    : '—' },
            { label: 'Signal',    val: ecgMeta?.signal_quality   ? `${Math.round(ecgMeta.signal_quality * 100)}%` : '—' },
          ].map(s => (
            <div key={s.label} className="bg-[var(--bg)]/40 border border-[var(--border)]/20 rounded-lg p-2">
              <div className="text-[7px] text-[var(--muted)]/50 mb-0.5">{s.label}</div>
              <div className="text-sm font-black font-mono" style={{ color: s.color || 'var(--text)' }}>{s.val}</div>
            </div>
          ))}
        </div>

        {/* Session BPM range */}
        {bpmStats.low != null && (
          <div className="mt-1.5 grid grid-cols-3 gap-1">
            {[
              { label: 'LOW',  val: bpmStats.low,  color: '#3b82f6' },
              { label: 'AVG',  val: bpmStats.avg,  color: '#22c55e' },
              { label: 'HIGH', val: bpmStats.high, color: '#ef4444' },
            ].map(s => (
              <div key={s.label} className="bg-[var(--bg)]/40 border border-[var(--border)]/20 rounded-lg p-1.5 text-center">
                <div className="text-[6px] text-[var(--muted)]/50">{s.label}</div>
                <div className="text-[11px] font-black font-mono" style={{ color: s.color }}>{s.val}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-[var(--border)]/30" />

      {/* Brain State */}
      <div>
        <p className="text-[9px] font-black text-[var(--muted)] uppercase tracking-[3px] px-1 mb-2">
          <Brain size={10} className="inline mr-1 text-[var(--primary)]" />Brain State
        </p>
        <div className="flex items-center justify-between bg-[var(--bg)]/40 border border-[var(--border)]/20 rounded-lg px-3 py-2 mb-2">
          <span className="text-[9px] text-[var(--muted)]">Current State</span>
          <span className="text-xs font-black" style={{ color: stColor }}>{mindState?.state || 'Neutral'}</span>
        </div>
        <div className="flex flex-col gap-1">
          {BAND_LABELS.map((label, i) => {
            const val = bandPowers?.[label.toLowerCase()] ?? 0;
            const pct = Math.min(100, (val / bandTotal) * 100);
            return (
              <div key={label} className="flex items-center gap-2">
                <span className="text-[7px] font-bold w-9 shrink-0" style={{ color: BAND_COLORS[i] }}>{label}</span>
                <div className="flex-1 h-1.5 bg-[var(--bg)]/60 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${pct}%`, backgroundColor: BAND_COLORS[i] }} />
                </div>
                <span className="text-[7px] font-mono text-[var(--muted)]/50 w-7 text-right">{pct.toFixed(0)}%</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Status footer */}
      <div className="mt-auto pt-3 border-t border-[var(--border)]/30">
        <div className="flex items-center gap-2 opacity-60">
          <div className={`w-2 h-2 rounded-full ${paused ? 'bg-amber-400' : 'bg-[var(--primary)] animate-pulse'}`} />
          <span className="text-[10px] font-bold text-[var(--text)] uppercase tracking-wider">
            {paused ? 'Stream Paused' : 'ECG Live'}
          </span>
        </div>
      </div>
    </div>
  );
}
