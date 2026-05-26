"""Quick EEG recording analysis script."""
import sys
sys.path.insert(0, 'backend')
import json, numpy as np
from scipy.signal import welch, butter, lfilter, iirnotch
from collections import Counter
from src.core.spectral_features import compute_band_powers
from src.core.feature_vector import compute_feature_vector
from src.modules.frontal_detectors import detect_mind_state, detect_stress_metrics, detect_focus_metrics, detect_meditation_metrics

# Load
with open('data/recordings/EEG__09-04-2026__01-44-58.csv.json') as f:
    rec = json.load(f)

meta = rec['metadata']
sr = meta['samplingRate']
dur = meta['duration']
samples = [d['channels']['ch1'] for d in rec['data']]
sig = np.array(samples, dtype=np.float64)

print(f'=== RECORDING INFO ===')
print(f'Samples: {len(sig)}, SR: {sr} Hz, Duration: {dur}s')
print(f'Actual duration: {len(sig)/sr:.1f}s')
print(f'Mean: {np.mean(sig):.1f}, Std: {np.std(sig):.1f}')
print(f'Range: [{np.min(sig):.1f}, {np.max(sig):.1f}]')
print()

# Filter: 50Hz notch + 0.5-120Hz bandpass (matches new config)
b_notch, a_notch = iirnotch(50.0, 30.0, fs=sr)
nyq = sr / 2
b_bp, a_bp = butter(4, [0.5/nyq, 120/nyq], btype='bandpass')
filtered = lfilter(b_notch, a_notch, sig)
filtered = lfilter(b_bp, a_bp, filtered)

print(f'=== FILTERED SIGNAL ===')
print(f'Mean: {np.mean(filtered):.1f}, Std: {np.std(filtered):.1f}')
print(f'Range: [{np.min(filtered):.1f}, {np.max(filtered):.1f}]')
print()

# Full-recording PSD
freqs, psd = welch(filtered, fs=sr, nperseg=sr*2)
bands = {'delta':(0.5,4), 'theta':(4,8), 'alpha':(8,12), 'beta':(12,30), 'gamma':(30,100)}
print(f'=== FULL RECORDING BAND POWERS ===')
total_power = 0
bp = {}
for name, (lo, hi) in bands.items():
    idx = np.logical_and(freqs >= lo, freqs <= hi)
    power = np.sum(psd[idx])
    bp[name] = power
    total_power += power
    print(f'  {name:>6}: {power:12.2f}')
print(f'  {"TOTAL":>6}: {total_power:12.2f}')
print()

print(f'=== RELATIVE POWERS (%) ===')
for name, power in bp.items():
    print(f'  {name:>6}: {power/total_power*100:6.1f}%')
print()

# Window-by-window analysis (2s windows, 0.5s step) — like mode_manager
win_size = int(sr * 2)
step_size = int(sr * 0.5)
n_wins = (len(filtered) - win_size) // step_size + 1

focus_vals = []
stress_vals = []
calm_vals = []
dominant_labels = []

for w in range(n_wins):
    start = w * step_size
    window = filtered[start:start+win_size]
    f, p = welch(window, fs=sr, nperseg=len(window))
    
    wp = {}
    for name, (lo, hi) in bands.items():
        idx = np.logical_and(f >= lo, f <= hi)
        wp[name] = np.sum(p[idx])
    
    tot = sum(wp.values()) + 1e-6
    ar = wp['alpha']/tot
    br = wp['beta']/tot
    tr = wp['theta']/tot
    
    dom = max(wp, key=wp.get)
    dominant_labels.append(dom)
    
    focus = min(100, max(0, (ar + tr*0.5)*200))
    stress = min(100, max(0, br*300))
    calm = max(0, min(1, (ar + tr*0.5)*1.5 - br*0.5))
    
    focus_vals.append(focus)
    stress_vals.append(stress)
    calm_vals.append(calm * 100)

focus_arr = np.array(focus_vals)
stress_arr = np.array(stress_vals)
calm_arr = np.array(calm_vals)

print(f'=== WINDOW ANALYSIS ({n_wins} windows, 2s win, 0.5s step) ===')
print(f'Focus  — mean: {np.mean(focus_arr):5.1f}, std: {np.std(focus_arr):5.1f}, min: {np.min(focus_arr):5.1f}, max: {np.max(focus_arr):5.1f}')
print(f'Stress — mean: {np.mean(stress_arr):5.1f}, std: {np.std(stress_arr):5.1f}, min: {np.min(stress_arr):5.1f}, max: {np.max(stress_arr):5.1f}')
print(f'Calm   — mean: {np.mean(calm_arr):5.1f}%, std: {np.std(calm_arr):5.1f}%, min: {np.min(calm_arr):5.1f}%, max: {np.max(calm_arr):5.1f}%')
print()

# Dominant wave distribution
dom_counts = Counter(dominant_labels)
print(f'=== DOMINANT WAVE DISTRIBUTION ===')
for wave, count in dom_counts.most_common():
    print(f'  {wave:>6}: {count:4d} windows ({count/n_wins*100:.1f}%)')
print()

# Dominant changes
changes = 0
for i in range(1, len(dominant_labels)):
    if dominant_labels[i] != dominant_labels[i-1]:
        changes += 1
print(f'Dominant wave changes: {changes}/{n_wins-1} ({changes/(n_wins-1)*100:.1f}% of steps)')
print()

# Stress jumps
stress_diffs = np.abs(np.diff(stress_arr))
big_jumps = np.sum(stress_diffs > 20)
print(f'=== STRESS STABILITY ===')
print(f'Mean step-to-step change: {np.mean(stress_diffs):5.1f}')
print(f'Max step-to-step change:  {np.max(stress_diffs):5.1f}')
print(f'Jumps > 20 pts: {big_jumps}/{len(stress_diffs)} ({big_jumps/len(stress_diffs)*100:.1f}%)')
print()

# First 15 windows detail
print(f'=== FIRST 15 WINDOWS (time, dominant, focus, stress, calm) ===')
for w in range(min(15, n_wins)):
    t = w * 0.5
    print(f'  {t:5.1f}s: {dominant_labels[w]:>6} | Focus:{focus_vals[w]:5.1f} | Stress:{stress_vals[w]:5.1f} | Calm:{calm_vals[w]:5.1f}%')

# EMA simulation
print()
print(f'=== EMA SMOOTHED (alpha=0.15) first 15 windows ===')
sf, ss2, sc = 0, 0, 0
sd = 'alpha'
hold = 0
HOLD_THRESH = 4
for w in range(min(15, n_wins)):
    t = w * 0.5
    sf = sf + 0.15*(focus_vals[w] - sf)
    ss2 = ss2 + 0.15*(stress_vals[w] - ss2)
    sc = sc + 0.15*(calm_vals[w] - sc)
    cand = dominant_labels[w]
    if cand != sd:
        hold += 1
        if hold >= HOLD_THRESH:
            sd = cand
            hold = 0
    else:
        hold = 0
    print(f'  {t:5.1f}s: {sd:>6} | Focus:{sf:5.1f} | Stress:{ss2:5.1f} | Calm:{sc:5.1f}%')

# Last 15 windows too
print()
print(f'=== LAST 15 WINDOWS (raw) ===')
for w in range(max(0, n_wins-15), n_wins):
    t = w * 0.5
    print(f'  {t:5.1f}s: {dominant_labels[w]:>6} | Focus:{focus_vals[w]:5.1f} | Stress:{stress_vals[w]:5.1f} | Calm:{calm_vals[w]:5.1f}%')

# ═══ FULL BACKEND PIPELINE TEST ═══
print()
print("=" * 70)
print("=== FULL BACKEND PIPELINE TEST (FIXED DETECTORS) ===")
print("=" * 70)
focus_history = []
for w in [0, 5, 10, 20, 40, 60, 80, 100, 150, 199]:
    if w >= n_wins:
        continue
    start = w * step_size
    window = filtered[start:start+win_size]
    
    bp2 = compute_band_powers(window, sr)
    fv = compute_feature_vector(bp2)
    
    mind = detect_mind_state(fv)
    stress = detect_stress_metrics(fv)
    focus = detect_focus_metrics(fv, focus_history)
    med = detect_meditation_metrics(fv)
    
    t = w * 0.5
    state_str = mind['state']
    level = mind['state_level']
    all_st = mind['all_states']
    print(f"  {t:5.1f}s: State={state_str:>8}({level:2d}) | Focus={focus['focus_score']:3d} Stress={stress['stress_score']:3d} Med={med['meditation_score']:3d}")
    print(f"         {all_st}")

