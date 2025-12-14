"""
Acquisition subpackage.

Contains modules for hardware data acquisition (EMG/EEG/EOG/etc.).
"""
# Empty to avoid circular imports or missing file errors during testing
# The main app is in acquisition.py
try:
    from .emg_processor import EMGProcessor
except Exception:
    pass

try:
    from .eog_processor import EOGProcessor
except Exception:
    pass

try:
    from .eeg_processor import EEGFFTProcessor
except Exception:
    pass

__all__ = ["emg_processor", "eog_processor", "eeg_processor"]



def __getattr__(name):
    if name == 'filter_router':
        from . import filter_router
        return filter_router
    elif name == 'emg_processor':
        from . import emg_processor
        return emg_processor
    elif name == 'eog_processor':
        from . import eog_processor
        return eog_processor
    elif name == 'eeg_processor':
        from . import eeg_processor
        return eeg_processor
    raise AttributeError(f"module '{__name__}' has no attribute '{name}'")