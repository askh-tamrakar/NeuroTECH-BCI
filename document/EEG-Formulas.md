# EEG Signal Processing & State Detection Formulas

> Reference document for NeuroTECH-BCI band power computation, feature extraction,
> mental state classification, and smoothing parameters.

---

## 1. Hardware Setup

| Parameter | Value |
|-----------|-------|
| Electrode | Fpz (+IN), A1 (−IN ref), A2 (REF/DRL bias) |
| ADC | Arduino UNO R4, 14-bit |
| Sample rate | 512 Hz (default) |
| EEG bandpass | 0.5–45 Hz (Butterworth) |
| EOG bandpass | 0.3–10 Hz (SOS Butterworth, removes DC drift) |

---

## 2. Frequency Bands

Power spectral density is computed via **Welch's method** (`scipy.signal.welch`, `nperseg = window length`).  
Band power = sum of PSD bins within the frequency range.

| Band | Range (Hz) | Neural correlate |
|------|-----------|------------------|
| **Delta** (δ) | 0.5 – 4 | Deep sleep, unconscious processes |
| **Theta** (θ) | 4 – 8 | Drowsiness, light meditation, memory encoding |
| **Alpha** (α) | 8 – 12 | Relaxed wakefulness, eyes-closed calm, inhibition |
| **Beta** (β) | 12 – 30 | Active thinking, focus, anxiety, motor planning |
| **Gamma** (γ) | 30 – 45 | Higher cognition (largely artifact on single-channel Fpz) |

---

## 3. Feature Vector (13 elements)

Computed in `backend/src/core/feature_vector.py`. Guard: ε = 10⁻⁶.

| Index | Name | Formula |
|-------|------|---------|
| 0 | delta | raw δ band power |
| 1 | theta | raw θ band power |
| 2 | alpha | raw α band power |
| 3 | beta | raw β band power |
| 4 | gamma | raw γ band power |
| 5 | theta/beta ratio | $\frac{\theta}{\beta + \varepsilon}$ |
| 6 | alpha/beta ratio | $\frac{\alpha}{\beta + \varepsilon}$ |
| 7 | beta/alpha ratio | $\frac{\beta}{\alpha + \varepsilon}$ |
| 8 | alpha/theta ratio | $\frac{\alpha}{\theta + \varepsilon}$ |
| 9 | calm_index | $\frac{\alpha + \theta}{\beta + \varepsilon}$ |
| 10 | stress_index | $\frac{\beta}{\alpha + \theta + \varepsilon}$ |
| 11 | engagement_index | $\frac{\beta}{\alpha + \varepsilon}$ |
| 12 | gamma/beta ratio | $\frac{\gamma}{\beta + \varepsilon}$ |

> **Note:** Gamma is excluded from `stress_index` because single-channel Fpz gamma is mostly muscle/electrode artifact.

---

## 4. State Detection — Unified `detect_mind_state()`

All pages (Music, Meditation, Bubble Game) use the **same** function so states always agree.

### 4.1 TAB Proportional Power

**Delta is excluded** from the proportion denominator.  On single-channel Fpz,
delta (0.5–4 Hz) is dominated by eye-blink artifacts, DC drift, and 1/f noise —
not cortical delta.  Only Theta, Alpha, Beta (TAB) are used:

$$\text{total}_{\text{TAB}} = \theta + \alpha + \beta + \varepsilon$$

$$p_\theta = \frac{\theta}{\text{total}_{\text{TAB}}}, \quad p_\alpha = \frac{\alpha}{\text{total}_{\text{TAB}}}, \quad p_\beta = \frac{\beta}{\text{total}_{\text{TAB}}}$$

### 4.2 Artifact Gate

When delta exceeds 40% of total power (including delta), the signal is
contaminated.  All state confidences are linearly scaled toward zero:

$$\text{delta\_frac} = \frac{\delta}{\delta + \theta + \alpha + \beta + \varepsilon}$$

$$\text{artifact\_scale} = \begin{cases} 1.0 & \text{if } \text{delta\_frac} \le 0.40 \\ \max\!\left(0,\; 1 - \frac{\text{delta\_frac} - 0.40}{0.40}\right) & \text{if } \text{delta\_frac} > 0.40 \end{cases}$$

Above 80% delta → all confidences = 0 → **Neutral**.

### 4.3 Normalized Indices

$$\text{ci\_norm} = \min\!\left(1,\; \frac{\text{calm\_index}}{4.0}\right)$$

$$\text{si\_norm} = \min\!\left(1,\; \frac{\text{stress\_index}}{2.0}\right)$$

$$\text{eng\_norm} = \min\!\left(1,\; \frac{\text{engagement\_index}}{3.0}\right)$$

### 4.4 Confidence Formulas

Each state is scored 0–100. The highest score wins (after artifact scaling).

#### Focus

> **Key band:** Beta (β > 25% of TAB required)  
> **Rationale:** Sustained attention elevates beta over the resting baseline; engagement reinforces it.

$$\text{Focus} = \min\!\Big(100,\;\; \max(0,\; p_\beta - 0.25) \times 220 \;+\; \text{eng\_norm} \times 25\Big)$$

- Beta-dominant TAB ($p_\beta = 0.65$, engagement = 3.25): $(0.40) \times 220 + 1.0 \times 25 = 88 + 25 \to \mathbf{100}$
- Alpha-dominant TAB ($p_\beta = 0.27$): $(0.02) \times 220 + 0.13 \times 25 = 4 + 3 = \mathbf{7}$

**Focus dampening under stress:** When `stress_index > 1.5`, focus is reduced to separate anxious arousal from genuine attention:

$$\text{dampen} = \max\!\big(0.3,\;\; 1.0 - (\text{stress\_index} - 1.5) \times 0.3\big)$$
$$\text{Focus} = \text{Focus} \times \text{dampen}$$

#### Calm

> **Key band:** Alpha (α)  
> **Rationale:** Dominant alpha rhythm indicates relaxed, awake idling. The calm index (α+θ)/β adds a small bonus.

$$\text{Calm} = \min\!\Big(100,\;\; p_\alpha \times 90 \;+\; \text{ci\_norm} \times 15\Big)$$

- Alpha-dominant ($p_\alpha = 0.87$, CI = 12.6): $0.87 \times 90 + 1.0 \times 15 = 78 + 15 = \mathbf{93}$
- Beta-dominant ($p_\alpha = 0.19$, CI = 0.75): $0.19 \times 90 + 0.19 \times 15 = 17 + 3 = \mathbf{20}$

#### Relaxed

> **Key bands:** Alpha (α) + Theta (θ) equally  
> **Rationale:** Meditation-like state where both alpha and theta are present, indicating deeper relaxation than pure alpha calm.

$$\text{Relaxed} = \min\!\Big(100,\;\; (p_\alpha \times 0.5 + p_\theta \times 0.5) \times 150\Big)$$

- Both at 40%: $(0.40 \times 0.5 + 0.40 \times 0.5) \times 150 = \mathbf{60}$

#### Stressed

> **Key metric:** Stress index (primary), beta power (secondary), alpha presence (negative)  
> **Rationale:** Uses stress_index + beta, but subtracts alpha presence to distinguish calm-focus (some alpha retained) from anxious arousal (alpha deeply suppressed).

$$\text{Stressed} = \max\!\Big(0,\;\; \min\!\big(100,\;\; \text{si\_norm} \times 80 \;+\; p_\beta \times 30 \;-\; p_\alpha \times 40\big)\Big)$$

- Anxious ($\text{si}=2.17$, $p_\beta=0.68$, $p_\alpha=0.21$): $1.0 \times 80 + 0.68 \times 30 - 0.21 \times 40 = 80 + 20 - 8 = \mathbf{92}$
- Calm-alpha ($\text{si}=0.25$, $p_\alpha=0.60$): $0.125 \times 80 + \dots - 0.60 \times 40 \to \mathbf{0}$ (clamped)

#### Drowsy

> **Key band:** Theta (θ) dominance in TAB + elevated θ/β ratio  
> **Rationale:** On single-channel Fpz, delta is unreliable (artifacts). Drowsiness is detected via theta dominance + high theta/beta ratio, which is the classic sleep-onset marker.

$$\text{Drowsy} = \min\!\Big(100,\;\; \max(0,\; p_\theta - 0.30) \times 150 \;+\; \text{tb\_norm} \times 40\Big)$$

where $\text{tb\_norm} = \min\!\left(1,\; \frac{\theta/\beta}{3.0}\right)$

- Theta-dominant TAB ($p_\theta = 0.55$, θ/β = 2.75): $(0.25) \times 150 + 0.92 \times 40 = 38 + 37 = \mathbf{74}$
- Normal awake TAB ($p_\theta = 0.25$, θ/β = 0.6): $0 + 0.20 \times 40 = \mathbf{8}$

#### Neutral

If no state scores above **15**, the result is **Neutral** with a fixed level of 50.

### 4.5 Hysteresis

The detected state must persist for **5 consecutive frames** before it replaces the previous state. This prevents rapid flickering between states.

```
if new_state ≠ previous_state:
    counter += 1
    if counter ≥ 5:
        accept new_state, reset counter
    else:
        keep previous_state
else:
    reset counter
```

---

## 5. Derived Scores

### 5.1 Focus Score

Computed in `detect_focus_metrics()`:

$$\text{eng\_clamped} = \text{clamp}(\text{engagement}, 0, 2.5)$$
$$\text{ratio\_bonus} = \max\!\left(0,\, 1.0 - \frac{\min(\theta/\beta,\, 1.5)}{1.5}\right)$$
$$\text{focus\_score} = \left(\frac{\text{eng\_clamped}}{2.5} \times 0.75 + \text{ratio\_bonus} \times 0.25\right) \times 100$$

Range: 0–100. High engagement + low θ/β → high focus.

### 5.2 Stress Score

Computed in `detect_stress_metrics()`:

$$\text{stress\_score} = \frac{\min(\text{stress\_index},\, 2.0)}{2.0} \times 100$$

| Score | Label | Action |
|-------|-------|--------|
| 0–50 | Calm | "You are doing great." |
| 51–75 | Elevated | "Consider pausing soon." |
| 76–100 | High Stress | "Take a 5 minute break. Box breathing recommended." |

### 5.3 Meditation Score

Computed in `detect_meditation_metrics()`:

$$\text{meditation\_score} = \frac{\min(\text{calm\_index},\, 5.0)}{5.0} \times 100$$

| Score | Label | Breathing guide |
|-------|-------|-----------------|
| 0–50 | Active mind | "Focus on your breath to relax" |
| 51–80 | Relaxing | "Breathe in... Breathe out..." |
| 81–100 | Deep Meditation | "Maintain slow, deep breaths" |

---

## 6. How Each Band Impacts Each State

| Band | Focus | Calm | Relaxed | Stressed | Drowsy |
|------|-------|------|---------|----------|--------|
| **Delta (δ)** | — | — | — | — | — (excluded; artifact gate only) |
| **Theta (θ)** | — | — | **Moderate ↑** (50% weight) | — | **Strong ↑** (×150 above 30%) |
| **Alpha (α)** | — | **Strong ↑** (×90) | **Moderate ↑** (50% weight) | **Moderate ↓** (−40) | — |
| **Beta (β)** | **Strong ↑** (×220 above 25%) | — | — | **Moderate ↑** (×30 direct, ×80 via SI) | — |
| **Gamma (γ)** | — | — | — | — | — |

### Interactions Between Bands

- **Beta vs Alpha:** Competing. High β/α → Focus or Stressed; High α/β → Calm.
- **Alpha + Theta together:** Cooperative → Relaxed (meditation-like state).
- **Theta dominance + high θ/β:** → Drowsy (sleep onset).
- **Beta + high stress_index + low alpha:** Stressed wins over Focus (dampening + alpha penalty).
- **Beta + low stress_index + some alpha:** Focus wins (engaged but not anxious).
- **High delta (> 40%):** Artifact gate suppresses all states → Neutral.

---

## 7. Smoothing Parameters

### 7.1 Backend EMA (per module)

$$\text{smoothed} = \text{prev} + \alpha \times (\text{new} - \text{prev})$$

| Module | α | Smoothed values |
|--------|---|-----------------|
| Music (`music_control.py`) | 0.25 | stress_score, focus_score |
| Meditation (`meditation_trainer.py`) | 0.20 | stress_score, focus_score, calm_score |

### 7.2 Frontend EMA

| View | α | Smoothed values |
|------|---|-----------------|
| MeditationView | 0.15 | band powers (5 bands), calm, focus, stress |

### 7.3 Frontend State Debounce

MusicView applies a **600 ms debounce** on state changes; state updates are ignored within 600 ms of the previous change.

---

## 8. Signal Processing Pipeline

```
Raw ADC → Bandpass (0.5–45 Hz, Butterworth)
       → Welch PSD (full-window segment)
       → Band power extraction (δ, θ, α, β, γ)
       → Feature vector (13 elements)
       → detect_mind_state() → state + confidence
       → Module-specific metrics (focus/stress/calm scores)
       → Backend EMA smoothing
       → WebSocket → Frontend
       → Frontend EMA smoothing → UI rendering
```

---

## 9. EOG Processing

| Parameter | Value |
|-----------|-------|
| Filter type | Butterworth bandpass, SOS format |
| Passband | 0.3–10 Hz |
| Order | 4 |
| Purpose | Removes DC offset drift and high-frequency noise |
| Stability | Verified stable at 256, 512, 1000, 2000 Hz sample rates |

---

## 10. Music State → Action Mapping

`classify_music_state()` delegates to `detect_mind_state()` then maps:

| State | Music Action |
|-------|-------------|
| Focus | Increase tempo |
| Calm | Lower volume |
| Relaxed | Play calm music |
| Stressed | Play calming music |
| Drowsy | Play stimulating music |
| Neutral | Maintain current track |
