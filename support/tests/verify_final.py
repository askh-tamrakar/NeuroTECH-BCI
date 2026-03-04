import sys
from pathlib import Path
import numpy as np

# Add src to path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.append(str(PROJECT_ROOT / "src"))

from feature.extractors.blink_extractor import BlinkExtractor

def test_final():
    sr = 512
    config = {"features": {"EOG": {"amp_threshold": 300.0}}}
    
    with open("verify_final_report.txt", "w", encoding="utf-8") as f:
        # Scenario 1: Ultra-Fast Double Blink (100ms Valley)
        extractor = BlinkExtractor(0, config, sr)
        f.write("\n--- Scenario 1: Ultra-Fast Double Blink (100ms Valley) ---\n")
        h1 = np.sin(np.linspace(0, np.pi, int(sr * 0.15))) * 1000
        vy = np.ones(int(sr * 0.10)) * 50 # 100ms valley
        h2 = np.sin(np.linspace(0, np.pi, int(sr * 0.15))) * 900
        sil = np.zeros(int(sr * 1.0))
        sig = np.concatenate([h1, vy, h2, sil])
        
        evs = []
        for s in sig:
            res = extractor.process(float(s))
            if res: evs.append(res)
        
        f.write(f"Windows: {len(evs)}\n")
        if evs:
            f.write(f"Peaks: {evs[0]['peak_count']}\n")
            f.write(f"Duration: {evs[0]['duration_ms']:.1f}ms\n")
            f.write(f"SUCCESS: Captured in one window with 2 peaks\n" if len(evs)==1 and evs[0]['peak_count']==2 else "FAILED\n")

        # Scenario 2: Smart Extraction (Training Data)
        f.write("\n--- Scenario 2: Smart Extraction (Double Blink Window) ---\n")
        # Full 1.5s window containing a double blink centered
        full_win = np.concatenate([np.zeros(int(sr * 0.5)), h1, vy, h2, np.zeros(int(sr * 0.5))])
        features = BlinkExtractor.extract_features_smart(full_win, sr)
        
        f.write(f"Peaks in Smart Crop: {features.get('peak_count')}\n")
        f.write(f"Duration of Smart Crop: {features.get('duration_ms'):.1f}ms\n")
        if features.get('peak_count') == 2:
            f.write("SUCCESS: Smart extraction preserved both peaks.\n")
        else:
            f.write("FAILED: Smart extraction lost a peak.\n")

if __name__ == "__main__":
    test_final()
