"""Analyze why Drowsy state dominates across recordings."""
import json, numpy as np
from scipy.signal import butter, sosfilt, welch

recordings = [
    'data/EEG/recording/EEG_09-04-2026__03-30-31',
    'data/EEG/recording/EEG_09-04-2026__04-20-09',
    'data/EEG/recording/EEG_09-04-2026__04-44-41',
    'data/EEG/recording/EEG_09-04-2026__12-34-52',
]
bands = {'delta': (0.5, 4), 'theta': (4, 8), 'alpha': (8, 12), 'beta': (12, 30), 'gamma': (30, 45)}

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

        props_list = []
        scores_list = []

        for i in range(n_wins):
            seg = filtered[i*win_size:(i+1)*win_size]
            freqs, psd = welch(seg, fs=sr, nperseg=len(seg))
            bp = {}
            for name, (lo, hi) in bands.items():
                mask = (freqs >= lo) & (freqs <= hi)
                bp[name] = float(np.sum(psd[mask]))

            total = bp['delta'] + bp['theta'] + bp['alpha'] + bp['beta'] + 1e-6
            p_d = bp['delta'] / total
            p_t = bp['theta'] / total
            p_a = bp['alpha'] / total
            p_b = bp['beta'] / total
            props_list.append((p_d, p_t, p_a, p_b))

            ci = (bp['alpha'] + bp['theta']) / (bp['beta'] + 1e-6)
            si = bp['beta'] / (bp['alpha'] + bp['theta'] + 1e-6)
            ei = bp['beta'] / (bp['alpha'] + 1e-6)

            drowsy = min(100, int(p_d * 100 + p_t * 60))
            calm = min(100, int(p_a * 90 + min(1.0, ci / 4.0) * 15))
            focus = min(100, int(max(0, p_b - 0.15) * 180 + min(1.0, ei / 3.0) * 25))
            relaxed = min(100, int((p_a * 0.5 + p_t * 0.5) * 150))
            stressed = min(100, int(min(1.0, si / 2.0) * 80 + p_b * 30))
            scores_list.append({'Drowsy': drowsy, 'Calm': calm, 'Focus': focus, 'Relaxed': relaxed, 'Stressed': stressed})

        props = np.array(props_list)
        name = rec_path.split('/')[-1]
        print(f"\n=== {name} === ({len(data)/sr:.1f}s, {sr}Hz, {n_wins} wins)")
        print(f"  Props(mean): d={props[:,0].mean():.3f} t={props[:,1].mean():.3f} a={props[:,2].mean():.3f} b={props[:,3].mean():.3f}")
        print(f"  Props(min):  d={props[:,0].min():.3f} t={props[:,1].min():.3f} a={props[:,2].min():.3f} b={props[:,3].min():.3f}")
        print(f"  Props(max):  d={props[:,0].max():.3f} t={props[:,1].max():.3f} a={props[:,2].max():.3f} b={props[:,3].max():.3f}")

        wins = {}
        for s in scores_list:
            w = max(s, key=s.get)
            wins[w] = wins.get(w, 0) + 1
        total_w = sum(wins.values())
        win_str = ', '.join(f"{k}={v}({v*100//total_w}%)" for k, v in sorted(wins.items(), key=lambda x: -x[1]))
        print(f"  Wins: {win_str}")

        avg_scores = {k: np.mean([s[k] for s in scores_list]) for k in ['Drowsy', 'Calm', 'Focus', 'Relaxed', 'Stressed']}
        score_str = ' '.join(f"{k}={v:.1f}" for k, v in sorted(avg_scores.items(), key=lambda x: -x[1]))
        print(f"  Scores(mean): {score_str}")

        # Show sample windows
        for j in [0, n_wins//4, n_wins//2, 3*n_wins//4, n_wins-1]:
            if j >= n_wins:
                continue
            p = props_list[j]
            s = scores_list[j]
            winner = max(s, key=s.get)
            print(f"    W{j:3d}: d={p[0]:.3f} t={p[1]:.3f} a={p[2]:.3f} b={p[3]:.3f} "
                  f"-> D={s['Drowsy']:3d} C={s['Calm']:3d} F={s['Focus']:3d} R={s['Relaxed']:3d} S={s['Stressed']:3d} [{winner}]")

        # Show the PROBLEM: typical awake Fpz has ~20% delta due to 1/f noise
        # Drowsy formula: p_d*100 + p_t*60
        # Even p_d=0.15, p_t=0.15 gives 15+9=24 -- Drowsy always has a floor
        print(f"\n  ** Drowsy floor analysis **")
        min_drowsy = min(s['Drowsy'] for s in scores_list)
        max_drowsy = max(s['Drowsy'] for s in scores_list)
        median_drowsy = np.median([s['Drowsy'] for s in scores_list])
        print(f"  Drowsy range: {min_drowsy}-{max_drowsy}, median={median_drowsy:.0f}")

    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"  ERROR: {e}")
