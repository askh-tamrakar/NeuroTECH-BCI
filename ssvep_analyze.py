import pandas as pd
import numpy as np
from scipy.signal import welch
import json

file1 = r"e:\WebSite\NeuroTECH-BCI\frontend\public\data\EEG\recordings\EEG__25-03-2026__13-06-55.csv"

results = {}

def analyze_file(filepath, label):
    df = pd.read_csv(filepath, skiprows=1)
    
    timestamps = df['timestamp'].values
    dts = np.diff(timestamps)
    median_dt = np.median(dts) / 1000.0  # seconds
    
    srate = 1000.0
    
    data = df['ch1'].values
    data = data - np.mean(data)
    
    nperseg = min(len(data), 1024)
    # If the file has 10 minutes, nperseg can be higher to get better resolution
    # Let's push nperseg higher (like 4096) for finer resolution if enough data exists
    if len(data) >= 4096:
        nperseg = 4096
    
    freqs, psd = welch(data, fs=srate, nperseg=nperseg)
    
    idx_8hz = np.argmin(np.abs(freqs - 8.0))
    power_8hz = psd[idx_8hz]
    
    idx_noise = (freqs >= 6) & (freqs <= 10) & (np.abs(freqs - 8.0) > 0.5)
    noise_power = np.median(psd[idx_noise])
    snr = power_8hz / noise_power if noise_power > 0 else 0
    
    idx_50 = np.argmin(np.abs(freqs - 50.0))
    
    idx_range = (freqs >= 1) & (freqs <= 30)
    freqs_range = freqs[idx_range]
    psd_range = psd[idx_range]
    max_idx = np.argmax(psd_range)
    peak_freq = freqs_range[max_idx]
    
    results[label] = {
        "samples": len(data),
        "median_dt_ms": float(median_dt * 1000),
        "power_8hz": float(power_8hz),
        "snr_8hz": float(snr),
        "noise_50Hz": float(psd[idx_50]),
        "peak_freq": float(peak_freq)
    }

analyze_file(file1, "New Recording")

with open(r"e:\WebSite\NeuroTECH-BCI\ssvep_results.json", "w") as f:
    json.dump(results, f, indent=4)
