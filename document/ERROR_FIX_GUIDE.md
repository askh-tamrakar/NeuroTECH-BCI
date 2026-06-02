# 🛠 Filter Router Crash — Error Fix Guide

## Crash Symptom

```
[12:37:01]   x Filter Router stopped unexpectedly (exit code: 3228369023)
```

- The **Filter Router** crashes ~8.5 seconds after starting up
- The entire pipeline shuts down immediately after
- This happens on **some team PCs** but not others
- Exit code **3228369023** is a **native/C++ crash** (not a Python exception)

---

## 🔍 Root Cause: scipy/numpy ABI Incompatibility

### The Problem

The `requirements.txt` has **dangerously loose version pins**:

```
numpy>=1.26.0,<3.0.0     ← spans numpy 1.x AND 2.x!
scipy>=1.12.0             ← NO upper bound!
```

When `pip install -r requirements.txt` runs, the resolver may install:

| PC | numpy | scipy | Works? |
|---|---|---|---|
| **Your PC** | 1.26.4 | 1.12.0 | ✅ |
| **Teammate's PC** | 1.26.4 | **1.14.0** | ❌ Crashes! |

scipy 1.13+ is compiled against **numpy 2.x's C API**. When it loads with numpy 1.26.x, the C extensions crash immediately because the internal C data structures don't match.

### Why It's a Silent Crash (No Error Message)

The crash happens inside **compiled C/Fortran code** inside scipy, not in Python. The process is terminated by Windows before Python can catch it or print a traceback.

### Crash Code Path

```
filter_router.py::main()
  → resolve_raw_stream()        ← ~3s: connects to LSL
  → _configure_pipeline()        ← creates processors
    → EMGFilterProcessor()        ← calls scipy.signal.sosfilt_zi()  ← 💥 CRASH
    → EOGFilterProcessor()        ← calls scipy.signal.sosfilt_zi()  ← 💥 CRASH
    → EEGFilterProcessor()        ← calls scipy.signal.sosfilt_zi()  ← 💥 CRASH
```

All three processor files (`emg_processor.py`, `eog_processor.py`, `eeg_processor.py`) call these scipy functions during initialization:
- `scipy.signal.sosfilt_zi()` — C extension
- `scipy.signal.butter()` — C extension
- `scipy.signal.lfilter_zi()` — C extension
- `scipy.signal.iirnotch()` — C extension

---

## 🛡️ Fix 1: Pin Exact Versions in requirements.txt (REQUIRED)

**File:** `backend/requirements.txt`

Change this:
```txt
numpy>=1.26.0,<3.0.0
scipy>=1.12.0
```

To this:
```txt
numpy==1.26.4
scipy==1.12.0
```

### ⚠️ Important

After updating `requirements.txt`, the teammate must **re-create their environment**:

```powershell
# 1. Uninstall the incompatible versions
pip uninstall numpy scipy -y

# 2. Reinstall with exact pinned versions
pip install -r requirements.txt

# 3. Verify the versions
python -c "import numpy; import scipy; print(f'numpy={numpy.__version__} scipy={scipy.__version__}')"
```

Expected output:
```
numpy=1.26.4 scipy=1.12.0
```

---

## 🧪 Fix 2: Add Crash Protection in Processor Init (Recommended)

Add try/except around scipy calls in all three processor files so that if the same issue occurs in the future, it prints a clear diagnostic instead of silently crashing.

### File: `backend/src/processing/emg_processor.py`

```python
class EMGFilterProcessor:
    def __init__(self, config: dict, sr: int = 512, channel_key: str = None):
        self.config = config
        self.sr = int(sr)
        self.channel_key = channel_key
        
        self._load_params()
        try:
            self._design_filters()
            self._init_filter_states()
        except Exception as e:
            print(f"[EMG] 🔴 CRITICAL: Filter design crashed!")
            print(f"[EMG]    scipy={__import__('scipy').__version__}, numpy={__import__('numpy').__version__}")
            print(f"[EMG]    Error: {e}")
            raise
```

Where `_init_filter_states()` is the existing init code:

```python
    def _init_filter_states(self):
        """Initialize filter state vectors (separated to catch scipy crashes)."""
        self.zi_hp = sosfilt_zi(self.sos_hp) * 0.0 if getattr(self, 'sos_hp', None) is not None else None
        self.zi_notch = lfilter_zi(self.b_notch, self.a_notch) * 0.0 if (self.notch_enabled and getattr(self, 'a_notch', None) is not None) else None
        self.zi_bp = sosfilt_zi(self.sos_bp) * 0.0 if (self.bp_enabled and getattr(self, 'sos_bp', None) is not None) else None
        self.zi_env = sosfilt_zi(self.sos_env) * 0.0 if self.envelope_enabled and getattr(self, 'sos_env', None) is not None else None
```

Apply the same pattern to `eog_processor.py` and `eeg_processor.py`.

---

## ✅ Fix 3: Use the Conda Environment Setup (Best Practice)

The `setup_conda_env.py` script installs numpy and scipy via **conda**, which handles ABI compatibility automatically:

```powershell
# Go to the backend directory
cd backend

# Create the conda environment (default name: neurotech-bci)
python setup_conda_env.py

# Activate it
conda activate neurotech-bci

# Run the pipeline
python pipeline.py
```

This avoids pip's binary compatibility issues entirely because conda resolves all dependencies together.

---

## 🔎 Fix 4: Verify Setup on the Teammate's PC

Run these checks on the teammate's PC to diagnose the issue:

```powershell
# 1. Check Python version
python --version
# Should be 3.10.x

# 2. Check installed versions
python -c "import numpy; print(f'numpy {numpy.__version__}')"
python -c "import scipy; print(f'scipy {scipy.__version__}')"

# 3. Test scipy signal module (this will crash if there's an ABI mismatch)
python -c "from scipy.signal import butter, sosfilt_zi, lfilter_zi, iirnotch; print('scipy.signal OK')"

# 4. Check if VC++ Redistributable is installed
Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\*" | 
  Select-Object @{N="Arch";E={$_.PSChildName}}, @{N="Installed";E={$_.Installed}}, Version, Bld | Format-Table

# 5. Try running the filter router directly (not through pipeline)
python -m src.processing.filter_router
```

---

## 📋 Other Possible Causes (If Fixes 1-4 Don't Help)

### Missing VC++ Redistributable
scipy's Windows wheels require the **Microsoft Visual C++ Redistributable**. Download from:
- https://aka.ms/vs/17/release/vc_redist.x64.exe

### Different Python Version
If the teammate uses Python 3.12 or 3.13, scipy may not have pre-compiled wheels. Stick to **Python 3.10** as specified in `setup_conda_env.py`.

### pylsl Native Library Crash
If scipy/numpy are fine, try testing pylsl in isolation:
```powershell
python -c "import pylsl; print(f'pylsl {pylsl.__version__}'); info = pylsl.StreamInfo('test', 'test', 1, 512, 'float32', 'test'); outlet = pylsl.StreamOutlet(info); print('pylsl OK')"
```

### Malformed Config Files
Check if `data/config/sensor_config.json` and `data/config/filter_config.json` are valid JSON:
```powershell
python -c "import json; json.load(open('data/config/sensor_config.json')); print('sensor_config OK')"
python -c "import json; json.load(open('data/config/filter_config.json')); print('filter_config OK')"
```

---

## 🚀 Quick Fix Checklist

| # | Step | Command |
|---|---|---|
| 1 | Uninstall broken packages | `pip uninstall numpy scipy -y` |
| 2 | Pin exact versions in `requirements.txt` | `numpy==1.26.4` + `scipy==1.12.0` |
| 3 | Reinstall | `pip install -r requirements.txt` |
| 4 | Verify | `python -c "import numpy, scipy; print(f'numpy={numpy.__version__} scipy={scipy.__version__}')"` |
| 5 | Test scipy | `python -c "from scipy.signal import butter, sosfilt_zi; print('scipy.signal OK')"` |
| 6 | Run pipeline | `python pipeline.py` |

---

## 📄 Files Referenced in This Guide

| File | Purpose |
|---|---|
| `backend/requirements.txt` | **🔧 Fix here** — pin numpy==1.26.4, scipy==1.12.0 |
| `backend/src/processing/filter_router.py` | Main filter router (1047 lines) |
| `backend/src/processing/emg_processor.py` | EMG processor — calls scipy.signal |
| `backend/src/processing/eog_processor.py` | EOG processor — calls scipy.signal |
| `backend/src/processing/eeg_processor.py` | EEG processor — calls scipy.signal |
| `backend/setup_conda_env.py` | Conda setup script (AVOIDS this issue) |
| `backend/pipeline.py` | Pipeline orchestrator |
| `backend/install_dependencies.bat` | Naive pip install script (causes the issue) |
