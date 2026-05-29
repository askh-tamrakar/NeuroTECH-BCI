# EMG Random Forest Training Guide

## Terminology

| Term | Meaning |
|---|---|
| **1 batch** | 1 press of the Record button → 1500ms of raw signal |
| **1 batch = 5 DB rows** | Each 1500ms parent window is split into 5 overlapping 900ms sub-windows; features extracted from each → 5 rows stored with the same `batch_id` |
| **1 sample (used loosely)** | = 1 batch = 1500ms of recording |
| **Features per row** | 13 time-domain features: `rms, mav, var, wl, peak, range, iemg, entropy, energy, kurtosis, skewness, ssc, wamp` |

---

## How the Data Pipeline Works

```
Record gesture (1.5s)
    → 1500ms parent window (768 samples @ 512 Hz)
        → split into 5 overlapping 900ms sub-windows
            → extract 13 features from each
                → 5 rows inserted into DB (shared batch_id)
```

The `batch_id` is used by the train/test split logic to **always keep all 5 rows of a batch together** — they never appear in different splits.

---

## How the Train/Val/Test Split Works

The split is **stratified at the batch (group) level**:
1. Each batch is assigned its dominant label (all 5 rows in a batch have the same label)
2. `StratifiedShuffleSplit` runs on batch-level labels — picks test batches proportionally per class
3. The remaining batches go to train+val, split further by `GroupKFold` into folds

This guarantees the test set always reflects the true class distribution of the dataset.

---

## Recommended Dataset Sizes

| Batches/class | DB rows/class | Recording time/class | Expected 4-class accuracy |
|---|---|---|---|
| 50 | 250 | ~75 sec | 88–92% |
| 100 | 500 | ~2.5 min | 93–96% |
| **150** | **750** | **~4 min** | **96–98%** ← recommended |
| 200 | 1000 | ~5 min | 97–99% |
| 250 | 1250 | ~6.5 min | 96–98% |
| 300 | 1500 | ~7.5 min | 97–99% |

> **Sweet spot: 150 batches/class** — 600 total batches, ~16 minutes of total recording.  
> Beyond 300/class, accuracy gain is <1% while training time increases significantly.

---

## Recording Guidelines

### Session Structure
- Record in **short bursts of 20–30 seconds** (~13–20 batches per press)
- Do **7–8 separate recording sessions per class** instead of one long one
- Reason: avoids muscle fatigue drift and captures natural electrode placement variation

### Per-Gesture Form
| Gesture | How to hold it |
|---|---|
| **Rest** | Hand completely limp/flat — genuinely relaxed, not just "not doing a gesture" |
| **Rock** | Full fist, moderate and consistent squeeze |
| **Paper** | Fingers flat and fully extended, held still |
| **Scissors** | Index + middle fingers extended, rest folded — hold the exact same angle each time |

### Environment
- Keep the **electrode in the exact same position** across all sessions — mark placement with a pen if needed
- Avoid recording when muscles are fatigued — `rms` and `energy` features drift significantly under fatigue
- Wait **2–3 seconds after forming the gesture** before pressing Record — avoids transition noise at the window start

---

## Split Settings

Set these in the ML View training panel:

### For 100 batches/class
| Parameter | Value |
|---|---|
| `test_split` | `0.20` |
| `n_folds` | `4` |
| Result | 60 train / 20 val / 20 test batches per class |

### For 150 batches/class (recommended)
| Parameter | Value |
|---|---|
| `test_split` | `0.20` |
| `n_folds` | `5` |
| Result | 96 train / 24 val / 30 test batches per class |

### For 200 batches/class
| Parameter | Value |
|---|---|
| `test_split` | `0.20` |
| `n_folds` | `5` |
| Result | 128 train / 32 val / 40 test batches per class |

### For 250–300 batches/class
| Parameter | Value |
|---|---|
| `test_split` | `0.15` |
| `n_folds` | `5` |
| Result | ~170 train / ~43 val / ~37 test batches per class |

---

## Hyperparameter Settings

### 100 batches/class
| Parameter | Min | Max | Resolution |
|---|---|---|---|
| n_estimators | 100 | 150 | 3 |
| max_depth | 5 | 10 | 3 |
| min_impurity_decrease | 0.0 | 0.002 | 3 |
| **Grid** | 3×3×3 = **27 candidates × 4 folds = 108 runs** | | |

### 150 batches/class ← recommended
| Parameter | Min | Max | Resolution |
|---|---|---|---|
| n_estimators | 100 | 200 | 3 |
| max_depth | 8 | 15 | 3 |
| min_impurity_decrease | 0.0 | 0.001 | 3 |
| **Grid** | 3×3×3 = **27 candidates × 5 folds = 135 runs** | | |

### 200 batches/class
| Parameter | Min | Max | Resolution |
|---|---|---|---|
| n_estimators | 100 | 200 | 4 |
| max_depth | 10 | 20 | 4 |
| min_impurity_decrease | 0.0 | 0.001 | 4 |
| **Grid** | 4×4×4 = **64 candidates × 5 folds = 320 runs** | | |

### 250–300 batches/class
| Parameter | Min | Max | Resolution |
|---|---|---|---|
| n_estimators | 150 | 300 | 4 |
| max_depth | 12 | 25 | 4 |
| min_impurity_decrease | 0.0 | 0.0005 | 4 |
| **Grid** | 4×4×4 = **64 candidates × 5 folds = 320 runs** | | |

### Notes on hyperparameters
- **`max_depth`** is the most impactful parameter for small datasets. Unlimited depth (`None`) memorizes individual batches and overfits heavily on <100 samples/class.
- **`n_estimators` above 200** gives <0.3% accuracy gain for 13 features — not worth the added training time.
- **`min_impurity_decrease`** acts as a noise filter on splits. Too high (>0.005) prunes useful branches; 0.0–0.001 is the safe range.
- **`search_resolution`** controls how many evenly-spaced values are sampled between min and max for each param. Resolution 3 → {min, mid, max}. Resolution 4 → 4 equally spaced points.

---

## Expected Accuracy by Class Pair

| Class pair | 100 batches | 150 batches | 200 batches | 250 batches | 300 batches |
|---|---|---|---|---|---|
| Rest vs any | ~99% | ~99% | ~99% | ~99% | ~99% |
| Rock vs Paper | ~93% | ~95% | ~96% | ~97% | ~97% |
| Rock vs Scissors | ~91% | ~94% | ~95% | ~96% | ~97% |
| Paper vs Scissors | ~88% | ~92% | ~94% | ~95% | ~96% |
| **Overall 4-class** | **88–92%** | **93–96%** | **95–97%** | **96–98%** | **97–99%** |

### Reading the confusion matrix
- Most errors will appear in the **Paper ↔ Scissors** cell — these gestures have the most similar EMG patterns.
- If **Rock ↔ Scissors** confuses, your Rock form is inconsistent (partial fist during some recordings).
- If **Rest** is confused with anything, the electrode likely moved between sessions.

---

## Feature Importance Reference

| Feature | What it captures | Most useful for |
|---|---|---|
| `rms` | Root mean square amplitude | Rest vs active |
| `mav` | Mean absolute value | Rest vs active |
| `energy` | Total signal power | Rest vs active |
| `iemg` | Integrated EMG (area under curve) | Rest vs active |
| `wl` | Waveform length (total arc length) | Rock vs Paper (sustained vs extension) |
| `ssc` | Slope sign changes | Rock vs Paper (contraction vs extension) |
| `wamp` | Willison amplitude (threshold crossings) | Rock vs Paper |
| `var` | Signal variance | Inter-gesture variation |
| `entropy` | Signal complexity/randomness | Paper vs Scissors |
| `kurtosis` | Peakedness of distribution | Paper vs Scissors (subtle) |
| `skewness` | Distribution asymmetry | Paper vs Scissors (subtle) |
| `peak` | Maximum amplitude | Peak force gestures (Rock) |
| `range` | Peak-to-peak amplitude | High-force gestures |

---

## Training Performance (after optimizations)

The training pipeline was optimized with:
1. **Pre-computed fold data**: `StandardScaler.fit_transform` runs once per fold (not once per candidate × fold), eliminating up to 315 redundant fits for a 64-candidate grid.
2. **`compress=1` on `joblib.dump`**: ~60% smaller rejected model files, faster disk I/O for large grids.
3. **`eventlet.sleep(0)` after each socket emit**: yields to the eventlet hub so progress updates are flushed to the frontend in real-time instead of batching at the end of training.

| Dataset (batches/class) | Grid candidates | Folds | Total runs | Estimated time |
|---|---|---|---|---|
| 100 | 27 | 4 | 108 | ~20–30 sec |
| 150 | 27 | 5 | 135 | ~40–60 sec |
| 200 | 64 | 5 | 320 | ~2–3 min |
| 300 | 64 | 5 | 320 | ~3–5 min |
