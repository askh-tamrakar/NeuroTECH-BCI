import pandas as pd
import numpy as np
from scipy.signal import welch
import json

file1 = r"e:\WebSite\NeuroTECH-BCI\frontend\public\data\EEG\recordings\EEG__25-03-2026__00-53-58.csv"
file2 = r"e:\WebSite\NeuroTECH-BCI\frontend\public\data\EEG\recordings\EEG__25-03-2026__00-55-35.csv"

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
    freqs, psd = welch(data, fs=srate, nperseg=nperseg)
    
    idx_8hz = np.argmin(np.abs(freqs - 8.0))
    power_8hz = psd[idx_8hz]
    
    idx_noise = (freqs >= 6) & (freqs <= 10)
    noise_power = np.median(psd[idx_noise])
    snr = power_8hz / noise_power if noise_power > 0 else 0
    
    idx_50 = np.argmin(np.abs(freqs - 50.0))
    
    results[label] = {
        "samples": len(data),
        "power_8hz": float(power_8hz),
        "snr_8hz": float(snr),
        "noise_50Hz": float(psd[idx_50])
    }

analyze_file(file1, "+IN=Oz, -IN=A2, REF=A1")
analyze_file(file2, "+IN=Oz, -IN=A1, REF=A2")

with open(r"e:\WebSite\NeuroTECH-BCI\ssvep_results.json", "w") as f:
    json.dump(results, f, indent=4)
