import pandas as pd
import numpy as np
from scipy import signal

file_path = r"e:\WebSite\NeuroTECH-BCI\frontend\public\data\EEG\recordings\EEG__25-03-2026__12-40-25.csv"

df = pd.read_csv(file_path, comment='#')
df['timestamp'] = df['timestamp'] - df['timestamp'].iloc[0]
df['time_sec'] = df['timestamp'] / 1000.0

fs = 1000 # sampling rate 1000Hz

def analyze_segment(time_start, time_end, name):
    mask = (df['time_sec'] >= time_start) & (df['time_sec'] < time_end)
    segment = df[mask]
    if len(segment) == 0:
        print(f"[{name}] No data found")
        return
    
    y = segment['ch1'].values
    y = y - np.mean(y)
    
    f, Pxx = signal.welch(y, fs, nperseg=fs*4) # 4 second windows for 0.25Hz resolution
    
    valid_idx = (f >= 2) & (f <= 30)
    f_valid = f[valid_idx]
    Pxx_valid = Pxx[valid_idx]
    
    target_freqs = [6, 8, 12]
    print(f"--- Analysis for {name} ({time_start}s to {time_end:.2f}s) ---")
    
    top_indices = np.argsort(Pxx_valid)[-5:][::-1]
    print("Top dominant frequencies (2-30Hz):")
    for idx in top_indices:
        print(f"  {f_valid[idx]:.2f} Hz | Power: {Pxx_valid[idx]:.2E}")
        
    print("Power at specific targets (+/- 0.5Hz peak):")
    for tf in target_freqs:
        # look for local max near tf
        mask_near = (f_valid >= tf - 0.5) & (f_valid <= tf + 0.5)
        if np.any(mask_near):
            f_near = f_valid[mask_near]
            Pxx_near = Pxx_valid[mask_near]
            idx_max = np.argmax(Pxx_near)
            print(f"  Target {tf}Hz -> Peak at {f_near[idx_max]:.2f} Hz | Power: {Pxx_near[idx_max]:.2E}")
    print()

analyze_segment(0, 40, "First 40 seconds")
analyze_segment(40, df['time_sec'].iloc[-1], "After 40 seconds")
analyze_segment(0, df['time_sec'].iloc[-1], "Total Duration")
