/**
 * Band Power Worker — ported from CortEX bandPower.worker.ts
 * Computes relative band powers from FFT spectra with sliding-window smoothing.
 */

// Frequency band definitions (Hz)
const BANDS = {
  delta: [0.5, 4],
  theta: [4, 8],
  alpha: [8, 12],
  beta:  [12, 30],
  gamma: [30, 45],
};

const BAND_KEYS = Object.keys(BANDS);

// Sliding-window smoother (128 samples ≈ 6.4s at 20 updates/sec)
class BandSmoother {
  constructor(bufferSize = 128) {
    this.bufferSize = bufferSize;
    this.buffers = {};
    this.sums = {};
    this.idx = 0;
    for (const band of BAND_KEYS) {
      this.buffers[band] = new Array(bufferSize).fill(0);
      this.sums[band] = 0;
    }
  }

  updateAll(vals) {
    for (const band of BAND_KEYS) {
      const old = this.buffers[band][this.idx];
      this.sums[band] -= old;
      this.sums[band] += vals[band] || 0;
      this.buffers[band][this.idx] = vals[band] || 0;
    }
    this.idx = (this.idx + 1) % this.bufferSize;
  }

  getAll() {
    const out = {};
    for (const band of BAND_KEYS) {
      out[band] = this.sums[band] / this.bufferSize;
    }
    return out;
  }
}

// Calculate band power from FFT magnitude spectrum
function calculateBandPower(mags, [f1, f2], sampleRate = 512, fftSize = 256) {
  const res = sampleRate / fftSize;
  const start = Math.max(1, Math.ceil(f1 / res));
  const end = Math.min(mags.length - 1, Math.floor(f2 / res));
  if (end < start) return 0;
  let power = 0;
  for (let i = start; i <= end; i++) {
    power += mags[i] * mags[i];
  }
  return power;
}

// Simple FFT (radix-2 Cooley-Tukey)
function fft(real, imag) {
  const n = real.length;
  let j = 0;
  for (let i = 0; i < n - 1; i++) {
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
    let k = n >> 1;
    while (k <= j) { j -= k; k >>= 1; }
    j += k;
  }
  for (let len = 2; len <= n; len *= 2) {
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      for (let j = i, k = 0; j < i + half; j++, k++) {
        const angle = -2 * Math.PI * k / len;
        const tRe = real[j + half] * Math.cos(angle) - imag[j + half] * Math.sin(angle);
        const tIm = real[j + half] * Math.sin(angle) + imag[j + half] * Math.cos(angle);
        real[j + half] = real[j] - tRe;
        imag[j + half] = imag[j] - tIm;
        real[j] += tRe;
        imag[j] += tIm;
      }
    }
  }
}

function computeMagnitudes(input, fftSize = 256) {
  const real = new Float32Array(fftSize);
  const imag = new Float32Array(fftSize);
  real.set(input.slice(0, fftSize));
  fft(real, imag);
  const mags = new Float32Array(fftSize >> 1);
  for (let i = 0; i < mags.length; i++) {
    mags[i] = Math.hypot(real[i], imag[i]) / (fftSize >> 1);
  }
  return mags;
}

// Per-channel smoothers
const smoother0 = new BandSmoother(128);
const smoother1 = new BandSmoother(128);

self.onmessage = (e) => {
  const { eeg0, eeg1, sampleRate = 512, fftSize = 256 } = e.data;

  // Compute FFT magnitudes for both channels
  const mags0 = eeg0 && eeg0.length >= fftSize ? computeMagnitudes(eeg0, fftSize) : null;
  const mags1 = eeg1 && eeg1.length >= fftSize ? computeMagnitudes(eeg1, fftSize) : null;

  const result = {};

  if (mags0) {
    const raw = {};
    for (const [band, range] of Object.entries(BANDS)) {
      raw[band] = calculateBandPower(mags0, range, sampleRate, fftSize);
    }
    const total = Object.values(raw).reduce((a, b) => a + b, 0) || 1;
    const rel = {};
    for (const band of BAND_KEYS) rel[band] = raw[band] / total;
    smoother0.updateAll(rel);
    result.smooth0 = smoother0.getAll();
  }

  if (mags1) {
    const raw = {};
    for (const [band, range] of Object.entries(BANDS)) {
      raw[band] = calculateBandPower(mags1, range, sampleRate, fftSize);
    }
    const total = Object.values(raw).reduce((a, b) => a + b, 0) || 1;
    const rel = {};
    for (const band of BAND_KEYS) rel[band] = raw[band] / total;
    smoother1.updateAll(rel);
    result.smooth1 = smoother1.getAll();
  }

  self.postMessage(result);
};
