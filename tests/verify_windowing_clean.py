import sys
from pathlib import Path
import numpy as np

# Add src to path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.append(str(PROJECT_ROOT / "src"))

from feature.extractors.blink_extractor import BlinkExtractor

def test():
    sr = 512
    config = {"features": {"EOG": {"amp_threshold": 300.0}}}
    
    with open("verify_result_clean.txt", "w", encoding="utf-8") as f:
        # Scenario 1: Biphasic
        extractor = BlinkExtractor(0, config, sr)
        f.write("\n--- Scenario 1: Biphasic ---\n")
        pos = np.sin(np.linspace(0, np.pi, int(sr * 0.2))) * 1000
        gap = np.zeros(int(sr * 0.1))
        neg = -np.sin(np.linspace(0, np.pi, int(sr * 0.2))) * 800
        sil = np.zeros(int(sr * 1.0))
        sig = np.concatenate([pos, gap, neg, sil])
        
        evs = []
        for s in sig:
            res = extractor.process(float(s))
            if res: evs.append(res)
        
        f.write(f"Windows: {len(evs)}\n")
        if evs:
            f.write(f"Peaks: {evs[0]['peak_count']}\n")
            f.write(f"Duration: {evs[0]['duration_ms']:.1f}ms\n")

        # Scenario 2: Double Hump
        extractor = BlinkExtractor(0, config, sr)
        f.write("\n--- Scenario 2: Double Hump ---\n")
        h1 = np.sin(np.linspace(0, np.pi, int(sr * 0.2))) * 1000
        vy = np.ones(int(sr * 0.15)) * 50
        h2 = np.sin(np.linspace(0, np.pi, int(sr * 0.2))) * 900
        sig2 = np.concatenate([h1, vy, h2, sil])
        
        evs2 = []
        for s in sig2:
            res = extractor.process(float(s))
            if res: evs2.append(res)
            
        f.write(f"Windows: {len(evs2)}\n")
        if evs2:
            f.write(f"Peaks: {evs2[0]['peak_count']}\n")
            f.write(f"Duration: {evs2[0]['duration_ms']:.1f}ms\n")

if __name__ == "__main__":
    test()
