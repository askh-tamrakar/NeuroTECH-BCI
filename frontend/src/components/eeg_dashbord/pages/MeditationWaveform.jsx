import React, { useEffect, useRef, useState } from 'react';

/**
 * 12-Phase Meditation Waveform — stacked-bar canvas.
 * Each phase shows the proportion of Relaxed (green), Focused (orange),
 * Deep Meditation (indigo), and Drowsy (gray) states.
 *
 * Ported from CortEX MeditationWaveform.tsx
 */

const STATE_COLORS = {
  relaxed: '#34d399',
  focused: '#f97316',
  deep:    '#6366f1',
  drowsy:  '#9ca3af',
};

function classifyState(alpha, beta, theta, delta) {
  const vals = { alpha, beta, theta, delta };
  const max  = Object.entries(vals).sort((a, b) => b[1] - a[1])[0][0];
  switch (max) {
    case 'alpha': return 'Relaxed';
    case 'beta':  return 'Focused';
    case 'theta': return 'Deep Meditation';
    case 'delta': return 'Drowsy';
    default:      return 'Relaxed';
  }
}

export default function MeditationWaveform({ data, sessionDurationSec, darkMode = true }) {
  const canvasRef = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  /* ── ResizeObserver ──────────────────────── */
  useEffect(() => {
    const c = canvasRef.current;
    if (!c?.parentElement) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(c.parentElement);
    return () => ro.disconnect();
  }, []);

  /* ── Draw 12-phase bars ──────────────────── */
  useEffect(() => {
    const c = canvasRef.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx || !data?.length || !size.w) return;

    const dpr = window.devicePixelRatio || 1;
    c.width  = size.w * dpr;
    c.height = size.h * dpr;
    ctx.scale(dpr, dpr);

    const W = size.w, H = size.h;
    const pad   = 16;
    const barW  = (W - pad * 2) / 12;
    const barMaxH = H - pad * 2;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = darkMode ? 'rgba(15,23,42,0.7)' : 'rgba(255,255,255,0.7)';
    ctx.fillRect(0, 0, W, H);

    // Phase labels at bottom
    ctx.fillStyle = darkMode ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';

    for (let p = 0; p < 12; p++) {
      const x = pad + p * barW + barW / 2;
      ctx.fillText(String(p + 1), x, H - 4);
    }

    // Compute 12 phases
    const phaseLen = Math.ceil(data.length / 12);
    for (let p = 0; p < 12; p++) {
      const seg = data.slice(p * phaseLen, (p + 1) * phaseLen);
      if (!seg.length) continue;

      const avg = (fn) => seg.reduce((s, d) => s + fn(d), 0) / seg.length;
      const a = avg(d => d.alpha), b = avg(d => d.beta),
            t = avg(d => d.theta), dl = avg(d => d.delta ?? 0);
      const total = a + b + t + dl || 1;

      const layers = [
        { key: 'drowsy',  v: dl / total, c: STATE_COLORS.drowsy  },
        { key: 'deep',    v: t  / total, c: STATE_COLORS.deep    },
        { key: 'focused', v: b  / total, c: STATE_COLORS.focused },
        { key: 'relaxed', v: a  / total, c: STATE_COLORS.relaxed },
      ];

      let yOff = pad;
      for (const layer of layers) {
        const h = layer.v * barMaxH;
        ctx.fillStyle = layer.c;
        ctx.globalAlpha = 0.85;
        ctx.fillRect(pad + p * barW, H - pad - yOff - h, barW - 2, h);
        yOff += h;
      }
      ctx.globalAlpha = 1;
    }
  }, [data, size, darkMode]);

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />;
}
