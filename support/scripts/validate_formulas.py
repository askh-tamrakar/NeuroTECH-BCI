"""Validate new detect_mind_state formulas against all recordings + synthetic scenarios."""
import json, numpy as np, sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'backend'))
from scipy.signal import butter, sosfilt, welch
from src.modules.frontal_detectors import detect_mind_state, _state_hold

bands_def = {'delta': (0.5, 4), 'theta': (4, 8), 'alpha': (8, 12), 'beta': (12, 30), 'gamma': (30, 45)}

def make_fv(delta, theta, alpha, beta, gamma=0.01):
    eps = 1e-6
    return [
        delta, theta, alpha, beta, gamma,
        theta / (beta + eps),      # theta/beta
        alpha / (beta + eps),      # alpha/beta
        beta / (alpha + eps),      # beta/alpha
        alpha / (theta + eps),     # alpha/theta
        (alpha + theta) / (beta + eps),   # calm_index
        beta / (alpha + theta + eps),     # stress_index
        beta / (alpha + eps),             # engagement
        gamma / (beta + eps),             # gamma/beta
    ]

def reset_hysteresis():
    _state_hold["prev"] = "Neutral"
    _state_hold["count"] = 0

# ── Part 1: Synthetic scenarios ──────────────────────────────────────
print("=" * 70)
print("SYNTHETIC SCENARIOS (raw band power, not proportions)")
print("=" * 70)

scenarios = [
    ("Alpha-dominant (calm)",       0.05, 0.10, 0.80, 0.05, "Calm"),
    ("Beta-dominant (focus)",       0.05, 0.10, 0.20, 0.65, "Focus"),
    ("Theta+Alpha (relaxed)",       0.05, 0.40, 0.40, 0.15, "Relaxed"),
    ("High delta artifact",         0.90, 0.04, 0.03, 0.03, "Neutral"),
    ("Extreme delta artifact",      0.95, 0.02, 0.02, 0.01, "Neutral"),
    ("Theta-dominant (drowsy)",     0.05, 0.60, 0.20, 0.15, "Drowsy"),
    ("Very high beta (stressed)",   0.02, 0.05, 0.05, 0.88, "Stressed"),
    ("Balanced (equal TAB)",        0.10, 0.30, 0.30, 0.30, "Relaxed"),
    ("Mild focus",                  0.08, 0.20, 0.30, 0.42, "Focus"),
    ("Deep meditation",             0.03, 0.45, 0.45, 0.07, "Relaxed"),
    ("Moderate delta + theta",      0.35, 0.30, 0.15, 0.20, "Relaxed"),
    ("Delta 50% + rest balanced",   0.50, 0.17, 0.17, 0.16, "Relaxed"),
]

all_pass = True
for name, d, t, a, b, expected in scenarios:
    reset_hysteresis()
    fv = make_fv(d, t, a, b)
    # Run 6 times to overcome hysteresis
    for _ in range(6):
        r = detect_mind_state(fv)
    state = r["state"]
    level = r["state_level"]
    scores = r["all_states"]
    ok = "PASS" if state == expected else "FAIL"
    if state != expected:
        all_pass = False
    print(f"  {ok:4s} {name:35s} -> {state:10s}(lv={level:3d})  "
          f"F={scores['Focus']:3d} C={scores['Calm']:3d} R={scores['Relaxed']:3d} S={scores['Stressed']:3d} D={scores['Drowsy']:3d}  "
          f"(expected: {expected})")

# ── Part 2: Real recordings ──────────────────────────────────────────
print("\n" + "=" * 70)
print("REAL RECORDINGS")
print("=" * 70)

recordings = [
    'data/EEG/recording/EEG_09-04-2026__03-30-31',
    'data/EEG/recording/EEG_09-04-2026__04-20-09',
    'data/EEG/recording/EEG_09-04-2026__04-44-41',
    'data/EEG/recording/EEG_09-04-2026__12-34-52',
]

for rec_path in recordings:
    try:
        with open(rec_path + '/metadata.json') as f:
            meta = json.load(f)
        sr = meta.get('sample_rate', 512)
        data = np.loadtxt(rec_path + '/data.csv', delimiter=',', skiprows=1)
        if data.ndim > 1:
            data = data[:, 0]
        sos = butter(4, [0.5/(sr/2), 45/(sr/2)], btype='bandpass', output='sos')
        filtered = sosfilt(sos, data)
        win_size = sr
        n_wins = len(filtered) // win_size

        wins = {}
        all_scores = []

        for i in range(n_wins):
            seg = filtered[i * win_size:(i + 1) * win_size]
            freqs, psd = welch(seg, fs=sr, nperseg=len(seg))
            bp = {}
            for name, (lo, hi) in bands_def.items():
                mask = (freqs >= lo) & (freqs <= hi)
                bp[name] = float(np.sum(psd[mask]))
            fv = make_fv(bp['delta'], bp['theta'], bp['alpha'], bp['beta'], bp['gamma'])

            reset_hysteresis()  # per-window so we see raw classification
            r = detect_mind_state(fv)
            state = r["state"]

            wins[state] = wins.get(state, 0) + 1
            all_scores.append(r["all_states"])

        total_w = sum(wins.values())
        name = rec_path.split('/')[-1]

        # Compute mean proportions
        props = []
        for i in range(n_wins):
            seg = filtered[i * win_size:(i + 1) * win_size]
            freqs, psd = welch(seg, fs=sr, nperseg=len(seg))
            bp_vals = {}
            for bname, (lo, hi) in bands_def.items():
                mask = (freqs >= lo) & (freqs <= hi)
                bp_vals[bname] = float(np.sum(psd[mask]))
            total = bp_vals['delta'] + bp_vals['theta'] + bp_vals['alpha'] + bp_vals['beta'] + 1e-6
            props.append([bp_vals['delta']/total, bp_vals['theta']/total, bp_vals['alpha']/total, bp_vals['beta']/total])
        props = np.array(props)

        print(f"\n  {name} ({len(data)/sr:.1f}s, {sr}Hz, {n_wins} windows)")
        print(f"    Band %: delta={props[:,0].mean()*100:.1f}% theta={props[:,1].mean()*100:.1f}% alpha={props[:,2].mean()*100:.1f}% beta={props[:,3].mean()*100:.1f}%")
        win_str = ', '.join(f"{k}={v}({v*100//total_w}%)" for k, v in sorted(wins.items(), key=lambda x: -x[1]))
        print(f"    State wins: {win_str}")
        avg = {k: np.mean([s[k] for s in all_scores]) for k in ['Focus', 'Calm', 'Relaxed', 'Stressed', 'Drowsy']}
        avg_str = ' '.join(f"{k}={int(v)}" for k, v in sorted(avg.items(), key=lambda x: -x[1]))
        print(f"    Mean scores: {avg_str}")

    except Exception as e:
        import traceback
        traceback.print_exc()

print("\n" + ("ALL SYNTHETIC TESTS PASSED" if all_pass else "*** SOME TESTS FAILED ***"))
