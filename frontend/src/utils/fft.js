/**
 * Fast Fourier Transform (Cooley-Tukey Radix-2)
 * Computes the discrete Fourier transform (DFT) of a given array of real values.
 */

function reverseBits(x, bits) {
    let y = 0;
    for (let i = 0; i < bits; i++) {
        y = (y << 1) | (x & 1);
        x >>= 1;
    }
    return y;
}

export function computeFFT(real, imag) {
    const N = real.length;
    const bits = Math.log2(N);
    if (bits % 1 !== 0) throw new Error("Length must be power of 2");

    // Bit-reversed addressing permutation
    for (let i = 0; i < N; i++) {
        const j = reverseBits(i, bits);
        if (j > i) {
            let temp = real[i];
            real[i] = real[j];
            real[j] = temp;
            temp = imag[i];
            imag[i] = imag[j];
            imag[j] = temp;
        }
    }

    // Cooley-Tukey decimation-in-time
    for (let size = 2; size <= N; size *= 2) {
        const halfSize = size / 2;
        const tabStep = N / size;
        for (let i = 0; i < N; i += size) {
            for (let j = i, k = 0; j < i + halfSize; j++, k += tabStep) {
                const t = -2 * Math.PI * k / N;
                const cosT = Math.cos(t);
                const sinT = Math.sin(t);
                
                const tr = cosT * real[j + halfSize] - sinT * imag[j + halfSize];
                const ti = sinT * real[j + halfSize] + cosT * imag[j + halfSize];
                
                real[j + halfSize] = real[j] - tr;
                imag[j + halfSize] = imag[j] - ti;
                real[j] += tr;
                imag[j] += ti;
            }
        }
    }
}

/**
 * Computes Power Spectrum from real signal array.
 * Signal array length will be automatically truncated or padded to nearest power of 2.
 */
export function getPowerSpectrum(signal, sampleRate) {
    // Find next lower power of 2
    const N = Math.pow(2, Math.floor(Math.log2(signal.length)));
    
    // Apply Hanning Window to reduce spectral leakage
    const real = new Float64Array(N);
    const imag = new Float64Array(N);
    
    for (let i = 0; i < N; i++) {
        const window = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)));
        real[i] = signal[signal.length - N + i] * window;
    }

    // Remove DC offset (mean)
    const mean = real.reduce((a, b) => a + b) / N;
    for (let i = 0; i < N; i++) real[i] -= mean;

    computeFFT(real, imag);

    const spectrum = [];
    // Only return the positive frequencies (up to Nyquist limit)
    for (let i = 0; i < N / 2; i++) {
        const freq = (i * sampleRate) / N;
        const magnitude = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
        // Normalize power
        const power = (magnitude * magnitude) / N;
        spectrum.push({ freq: Number(freq.toFixed(2)), power: power });
    }
    return spectrum;
}
