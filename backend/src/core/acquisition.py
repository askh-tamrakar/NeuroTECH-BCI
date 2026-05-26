"""
EEG Acquisition Module
Connects to the raw LSL stream and provides an interface to pull samples.
"""
import pylsl
import time
import logging

log = logging.getLogger(__name__)

class EEGAcquisition:
    def __init__(self, stream_name="BioSignals-Raw-uV"):
        self.stream_name = stream_name
        self.inlet = None
        self.channel_count = 0
        self.srate = 0

    def connect(self, timeout=5.0):
        log.info(f"Looking for LSL stream: {self.stream_name}...")
        streams = pylsl.resolve_streams(wait_time=1.0)
        target = None
        for s in streams:
            if s.name() == self.stream_name:
                target = s
                break
        
        if not target:
            # Fallback heuristic
            for s in streams:
                if "raw" in s.name().lower() or "uv" in s.name().lower():
                    target = s
                    break

        if target:
            self.inlet = pylsl.StreamInlet(target, max_buflen=1, recover=True)
            self.channel_count = target.channel_count()
            self.srate = target.nominal_srate()
            log.info(f"Connected to {target.name()} ({self.channel_count} channels @ {self.srate}Hz)")
            return True
        else:
            log.error(f"Stream {self.stream_name} not found.")
            return False

    def get_sample(self, timeout=1.0):
        if not self.inlet:
            return None, None
        return self.inlet.pull_sample(timeout=timeout)

    def close(self):
        if self.inlet:
            self.inlet.close_stream()
            self.inlet = None
