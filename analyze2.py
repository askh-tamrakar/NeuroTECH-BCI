import sys
import numpy as np

file_path = r"e:\WebSite\NeuroTECH-BCI\frontend\public\data\EEG\recordings\EEG__25-03-2026__13-06-55.csv"

print("Loading data...", flush=True)

times = []
ch1 = []

with open(file_path, "r") as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split(",")
        if len(parts) >= 2 and parts[0] != "timestamp":
            try:
                times.append(float(parts[0]))
                ch1.append(float(parts[1]))
            except ValueError:
                pass

print(f"Loaded {len(times)} rows.", flush=True)

if not times:
    print("No data.")
    sys.exit(0)

times = np.array(times)
ch1 = np.array(ch1)
times = (times - times[0]) / 1000.0

fs = 1000

def analyze_segment(time_start, time_end, name):
    print(f"--- Analysis for {name} ({time_start}s to {time_end:.2f}s) ---", flush=True)
    mask = (times >= time_start) & (times < time_end)
    y = ch1[mask]
    
    if len(y) == 0:
        print(f"[{name}] No data found", flush=True)
        return
    
    y = y - np.mean(y)
    
    # Welch's method emulation using numpy
    # Break into 4 second chunks (4000 samples)
    chunk_size = 4000
    num_chunks = len(y) // chunk_size
    if num_chunks == 0:
        chunk_size = len(y)
        num_chunks = 1
        
    pxx_sum = None
    for i in range(num_chunks):
        chunk = y[i*chunk_size:(i+1)*chunk_size]
        # Hanning window
        window = np.hanning(len(chunk))
        windowed = chunk * window
        
        yf = np.abs(np.fft.rfft(windowed))**2
        if pxx_sum is None:
            pxx_sum = yf
        else:
            pxx_sum += yf
            
    pxx = pxx_sum / num_chunks
    f_axis = np.fft.rfftfreq(chunk_size, 1/fs)
    
    valid_idx = (f_axis >= 2) & (f_axis <= 30)
    f_valid = f_axis[valid_idx]
    p_valid = pxx[valid_idx]
    
    target_freqs = [6, 8, 12]
    
    top_indices = np.argsort(p_valid)[-5:][::-1]
    print("Top dominant frequencies (2-30Hz):", flush=True)
    for idx in top_indices:
        print(f"  {f_valid[idx]:.2f} Hz | Power: {p_valid[idx]:.2E}", flush=True)
        
    print("Power at specific targets (+/- 0.5Hz peak):", flush=True)
    for tf in target_freqs:
        # look for local max near tf
        mask_near = (f_valid >= tf - 0.5) & (f_valid <= tf + 0.5)
        if np.any(mask_near):
            f_near = f_valid[mask_near]
            Pxx_near = p_valid[mask_near]
            idx_max = np.argmax(Pxx_near)
            print(f"  Target {tf}Hz -> Peak at {f_near[idx_max]:.2f} Hz | Power: {Pxx_near[idx_max]:.2E}", flush=True)
    print("", flush=True)


analyze_segment(0, 40, "First 40 seconds")
analyze_segment(40, times[-1], "After 40 seconds")
analyze_segment(0, times[-1], "Total Duration")
