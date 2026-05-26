Below is the **updated final implementation in Markdown** with **Sampling Rate = 1000 Hz (1 kHz)** and all parameters redesigned accordingly.

You can paste this directly into `README.md` or `system_design.md` for Codex/Gemini.

---

# 1-Channel SSVEP BCI System

## FBCCA + LDA Implementation (1 kHz, Dynamic Frequencies, React Flicker)

---

# 1. System Overview

This project implements a **real-time 1-channel SSVEP Brain-Computer Interface** using:

* Device: Upside Down Labs EXG Pill
* Sampling Rate: **1000 Hz**
* Display: **144 Hz monitor**
* Targets: **Dynamic (based on monitor refresh rate)**
* Feature Extraction: **FBCCA (Filter Bank Canonical Correlation Analysis)**
* Classifier: **LDA (Linear Discriminant Analysis)**
* Frontend: **React Flicker UI**
* Backend: **Python Signal Processing + ML**

Target performance:

* Accuracy: **90–95%**
* Latency: **1–1.5 sec**
* Stable predictions (temporal smoothing)

---

# 2. Full Processing Pipeline

```text
EEG (1000 Hz)
   ↓
Bandpass Filter (6–60 Hz)
   ↓
Notch Filter (50 Hz)
   ↓
Z-score Normalization
   ↓
Windowing (1.5 sec, 0.25 sec step)
   ↓
Filter Bank (4 bands)
   ↓
FBCCA (multi-harmonic correlation)
   ↓
Feature Extraction
   ↓
LDA Classifier
   ↓
Temporal Smoothing
   ↓
Confidence Threshold
   ↓
Final Decision
```

---

# 3. Sampling and Windowing

## Sampling Rate

```
fs = 1000 Hz
```

## Window

```
Window length = 1.5 sec
Samples per window = 1500 samples
Step size = 0.25 sec = 250 samples
Overlap = 1250 samples
```

## Frequency Resolution

```
Resolution = fs / N = 1000 / 1500 ≈ 0.67 Hz
```

This is sufficient to separate SSVEP targets.

---

# 4. Preprocessing

## 4.1 Bandpass Filter

```
Range: 6–60 Hz
Filter type: Butterworth
Order: 4
```

## 4.2 Notch Filter

```
Frequency: 50 Hz
Q factor: 30
```

## 4.3 Normalization

Apply per window:

```
x_norm = (x - mean(x)) / std(x)
```

---

# 5. Dynamic Frequency System (Monitor Dependent)

## Frequency Formula

```
frequency = refresh_rate / N
```

Where:

```
refresh_rate = detected monitor refresh rate
N = integer (6–30)
Valid frequency range = 6–20 Hz
```

## Example (144 Hz monitor)

| N  | Frequency |
| -- | --------- |
| 18 | 8 Hz      |
| 16 | 9 Hz      |
| 12 | 12 Hz     |
| 10 | 14.4 Hz   |
| 9  | 16 Hz     |
| 8  | 18 Hz     |

These 6 frequencies should be used as targets.

---

# 6. Filter Bank (FBCCA)

Use **4 filter bands**:

| Band | Frequency Range |
| ---- | --------------- |
| B1   | 6–60 Hz         |
| B2   | 12–60 Hz        |
| B3   | 18–60 Hz        |
| B4   | 24–60 Hz        |

## Weights

```
weights = [1.0, 0.7, 0.4, 0.2]
```

---

# 7. Reference Signal Generation

For each frequency `f`:

Use **4 harmonics**.

```
t = np.arange(window_size) / fs

For each harmonic h in [1,2,3,4]:
    sin(2π f h t)
    cos(2π f h t)
```

---

# 8. FBCCA Score Computation

For each:

* Filter band
* Target frequency

Compute correlation between:

```
EEG_band_signal
Reference_signals(frequency)
```

Then compute weighted sum:

```
score_f = Σ (weight_i × correlation_i)
```

Output:

```
scores = [score_f1, score_f2, score_f3, score_f4, score_f5, score_f6]
```

---

# 9. Feature Extraction for LDA

Use enriched feature vector:

```
features = [
    score_1,
    score_2,
    score_3,
    score_4,
    score_5,
    score_6,
    max_score,
    second_max_score,
    max_score / second_max_score,
    mean(scores),
    std(scores)
]
```

Normalize:

```
scores = scores / sum(scores)
```

This allows dynamic number of targets.

---

# 10. LDA Classifier

## Training

```
from sklearn.discriminant_analysis import LinearDiscriminantAnalysis

model = LinearDiscriminantAnalysis()
model.fit(X_train, y_train)
```

## Prediction

```
prediction = model.predict(features)
probabilities = model.predict_proba(features)
confidence = max(probabilities)
```

---

# 11. Decision Logic

## Confidence Threshold

```
if confidence > 0.6 and (max_score / second_max_score) > 1.2:
    accept prediction
else:
    reject
```

## Temporal Smoothing

Use last 7 predictions:

```
final_prediction = majority_vote(last_7_predictions)
```

---

# 12. React Flicker System (Frontend)

## Detect Refresh Rate

Use `requestAnimationFrame` to estimate refresh rate.

## Flicker Logic

```
frames_per_cycle = refresh_rate / frequency
half_cycle = frames_per_cycle / 2

if frame % frames_per_cycle < half_cycle:
    WHITE
else:
    BLACK
```

Use **checkerboard flicker** for stronger SSVEP.

---

# 13. Backend Dynamic Configuration

Frontend sends:

```
{
  "sampling_rate": 1000,
  "frequencies": [8, 9, 12, 14.4, 16, 18]
}
```

Backend updates:

* Reference signals
* FBCCA targets
* Feature extractor

**Do NOT retrain model every time frequencies change.**

Use one generalized model.

---

# 14. Data Collection Protocol

For each frequency:

```
Trials per frequency: 30–50
Trial duration: 3 seconds
Rest between trials: 2 seconds
```

Total dataset:

```
6 frequencies × 40 trials = 240 trials
```

---

# 15. Expected Accuracy

| Method      | Accuracy |
| ----------- | -------- |
| FFT         | 65–75%   |
| CCA         | 75–85%   |
| FBCCA       | 85–92%   |
| FBCCA + LDA | 90–95%   |

---

# 16. Project Structure

```
SSVEP-BCI/
│
├── README.md
├── system_design.md
├── fbcca.py
├── preprocessing.py
├── lda_model.py
├── realtime_pipeline.py
│
├── frontend/
│   └── react_flicker/
│
├── data/
│
└── config/
    └── frequencies.json
```

---

# 17. Real-Time Loop

```
while True:
    read EEG
    preprocess
    window
    filter bank
    FBCCA
    extract features
    LDA predict
    smoothing
    output command
```

---

# 18. Critical Success Factors

To achieve 90–95% accuracy:

1. Electrode at **Oz**
2. Use **gel electrodes**
3. Stable sampling at **1000 Hz**
4. Accurate flicker frequency
5. Use harmonics (1–4)
6. Use temporal smoothing
7. Use confidence threshold
8. Train with enough trials

---

# 19. Final System Summary

| Component          | Method                      |
| ------------------ | --------------------------- |
| Sampling           | 1000 Hz                     |
| Targets            | Dynamic                     |
| Feature Extraction | FBCCA                       |
| Harmonics          | 4                           |
| Classifier         | LDA                         |
| Window             | 1.5 sec                     |
| Step               | 0.25 sec                    |
| Smoothing          | 7 windows                   |
| Display            | React (frame-based flicker) |

---

# End of Specification

This document defines the full implementation for a **dynamic 1-channel SSVEP BCI using FBCCA + LDA at 1 kHz sampling rate**.
