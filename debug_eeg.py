import json, numpy as np
from scipy.signal import welch, butter, lfilter, iirnotch

with open(r'data\recordings\EEG__09-04-2026__01-44-58.csv.json') as f:
    rec = json.load(f)

all_samples = np.array([d['channels']['ch1'] for d in rec['data']])
sr = 512  # CORRECT sample rate
print(f'Samples: {len(all_samples)}, SR: {sr}Hz, Duration: {len(all_samples)/sr:.1f}s')

# Pipeline filtering: notch 50Hz + bandpass 0.5-45Hz (4th order Butterworth)
b_notch, a_notch = iirnotch(50.0, 30.0, fs=sr)
nyq = sr / 2.0
b_bp, a_bp = butter(4, [0.5/nyq, 45.0/nyq], btype='bandpass')

bands = {'delta': (0.5,4), 'theta': (4,8), 'alpha': (8,12), 'beta': (12,30), 'gamma': (30,45)}

# Window positions (start sample index, 2sec=1024 samples)
win_positions = [
    ("5-7s", 2560),
    ("20-22s", 10240),
    ("50-52s", 25600),
    ("80-82s", 40960),
]

print("\n=== PER-WINDOW FILTERING (as pipeline does) ===")
print("Each window is filtered independently with zero initial conditions")
for label, start in win_positions:
    raw_win = all_samples[start:start+1024]
    # Apply filter per-window (zero initial state like pipeline)
    notched = lfilter(b_notch, a_notch, raw_win)
    filtered = lfilter(b_bp, a_bp, notched)
    
    freqs, psd = welch(filtered, fs=sr, nperseg=len(filtered))
    powers = {}
    for name, (lo, hi) in bands.items():
        idx = np.logical_and(freqs >= lo, freqs <= hi)
        powers[name] = float(np.sum(psd[idx]))

    total = sum(powers.values()) + 1e-10
    d,t,a,b2,g = [powers[x] for x in ['delta','theta','alpha','beta','gamma']]
    eps = 1e-6
    calm_idx = (a+t)/(b2+eps)
    stress_idx = (b2+g)/(a+t+eps)
    engage_idx = b2/(a+eps)
    theta_beta = t/(b2+eps)
    
    # classify_music_state
    total_tab = t + a + b2 + eps
    p_t, p_a, p_b = t/total_tab, a/total_tab, b2/total_tab
    if p_b > 0.48: ms='Focus'
    elif p_t > 0.46: ms='Drowsy'
    elif p_a > 0.42 and p_t > 0.22: ms='Calm'
    elif p_a > 0.42: ms='Relax'
    else: ms='Neutral'

    # detect_mind_state
    ptotal = d+t+a+b2+g+eps
    pd, pt, pa, pb, pg = d/ptotal, t/ptotal, a/ptotal, b2/ptotal, g/ptotal
    focus_conf = min(100, int((pb * 0.6 + min(engage_idx, 2.5) / 2.5 * 0.4) * 150))
    calm_conf = min(100, int((pa * 0.5 + min(calm_idx, 5.0) / 5.0 * 0.4) * 140))
    relaxed_conf = min(100, int((pa * 0.4 + pt * 0.3) * 160))
    stressed_conf = min(100, int((pb * 0.35 + pg * 0.3 + min(stress_idx, 3.0) / 3.0 * 0.35) * 140))
    drowsy_conf = min(100, int((pd * 0.45 + pt * 0.4) * 150))
    all_states = {"Focus": focus_conf, "Calm": calm_conf, "Relaxed": relaxed_conf, "Stressed": stressed_conf, "Drowsy": drowsy_conf}
    dominant = max(all_states, key=all_states.get)
    level = all_states[dominant]
    if level < 20: dominant = "Neutral"; level = 50

    # Scores
    ss = int(min(3.0, max(0.0, stress_idx))/3.0*100)
    ec = max(0, min(2.5, engage_idx))
    rb = max(0, min(1, 1-min(theta_beta,1.5)/1.5))
    fs = int(max(0, min(1, (ec/2.5)*0.75 + rb*0.25))*100)
    ci = min(5.0, max(0.0, calm_idx))
    medsc = int((ci/5.0)*100)

    print(f'\n  {label}:')
    print(f'    Bands%: d={d/total*100:.1f} t={t/total*100:.1f} a={a/total*100:.1f} b={b2/total*100:.1f} g={g/total*100:.1f}')
    print(f'    Music: {ms} (p_t={p_t:.3f} p_a={p_a:.3f} p_b={p_b:.3f})')
    print(f'    MindState: {dominant}({level}) {all_states}')
    print(f'    Stress={ss}% Focus={fs}% Meditation={medsc}%')

print("\n\n=== CONTINUOUS FILTERING (whole recording, then window) ===")
notch_all = lfilter(b_notch, a_notch, all_samples)
filt_all = lfilter(b_bp, a_bp, notch_all)
for label, start in win_positions:
    filtered = filt_all[start:start+1024]
    
    freqs, psd = welch(filtered, fs=sr, nperseg=len(filtered))
    powers = {}
    for name, (lo, hi) in bands.items():
        idx = np.logical_and(freqs >= lo, freqs <= hi)
        powers[name] = float(np.sum(psd[idx]))

    total = sum(powers.values()) + 1e-10
    d,t,a,b2,g = [powers[x] for x in ['delta','theta','alpha','beta','gamma']]
    eps = 1e-6
    calm_idx = (a+t)/(b2+eps)
    stress_idx = (b2+g)/(a+t+eps)
    engage_idx = b2/(a+eps)
    theta_beta = t/(b2+eps)
    
    total_tab = t + a + b2 + eps
    p_t, p_a, p_b = t/total_tab, a/total_tab, b2/total_tab
    if p_b > 0.48: ms='Focus'
    elif p_t > 0.46: ms='Drowsy'
    elif p_a > 0.42 and p_t > 0.22: ms='Calm'
    elif p_a > 0.42: ms='Relax'
    else: ms='Neutral'

    ptotal = d+t+a+b2+g+eps
    pd, pt, pa, pb, pg = d/ptotal, t/ptotal, a/ptotal, b2/ptotal, g/ptotal
    focus_conf = min(100, int((pb * 0.6 + min(engage_idx, 2.5) / 2.5 * 0.4) * 150))
    calm_conf = min(100, int((pa * 0.5 + min(calm_idx, 5.0) / 5.0 * 0.4) * 140))
    relaxed_conf = min(100, int((pa * 0.4 + pt * 0.3) * 160))
    stressed_conf = min(100, int((pb * 0.35 + pg * 0.3 + min(stress_idx, 3.0) / 3.0 * 0.35) * 140))
    drowsy_conf = min(100, int((pd * 0.45 + pt * 0.4) * 150))
    all_states = {"Focus": focus_conf, "Calm": calm_conf, "Relaxed": relaxed_conf, "Stressed": stressed_conf, "Drowsy": drowsy_conf}
    dominant = max(all_states, key=all_states.get)
    level = all_states[dominant]
    if level < 20: dominant = "Neutral"; level = 50

    ss = int(min(3.0, max(0.0, stress_idx))/3.0*100)
    ec = max(0, min(2.5, engage_idx))
    rb = max(0, min(1, 1-min(theta_beta,1.5)/1.5))
    fs = int(max(0, min(1, (ec/2.5)*0.75 + rb*0.25))*100)
    ci = min(5.0, max(0.0, calm_idx))
    medsc = int((ci/5.0)*100)

    print(f'\n  {label}:')
    print(f'    Bands%: d={d/total*100:.1f} t={t/total*100:.1f} a={a/total*100:.1f} b={b2/total*100:.1f} g={g/total*100:.1f}')
    print(f'    Music: {ms} (p_t={p_t:.3f} p_a={p_a:.3f} p_b={p_b:.3f})')
    print(f'    MindState: {dominant}({level}) {all_states}')
    print(f'    Stress={ss}% Focus={fs}% Meditation={medsc}%')
