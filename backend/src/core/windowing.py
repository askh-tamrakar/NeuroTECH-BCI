"""
Windowing Module
Buffers incoming samples into windows for processing.
"""
import numpy as np

class EEGWindowBuffer:
    def __init__(self, window_size_sec, step_size_sec, sr=1000, num_channels=1):
        self.window_size = int(window_size_sec * sr)
        self.step_size = int(step_size_sec * sr)
        self.sr = sr
        self.num_channels = num_channels
        
        self.buffer = np.zeros((self.window_size, self.num_channels))
        self.current_size = 0
        self.samples_since_last_window = 0

    def add_sample(self, sample):
        """
        Add a single sample. Returns True if a new window is ready.
        sample: list or array of size num_channels
        """
        # Shift buffer and insert new sample at the end
        self.buffer[:-1, :] = self.buffer[1:, :]
        self.buffer[-1, :] = sample
        
        if self.current_size < self.window_size:
            self.current_size += 1
            
        self.samples_since_last_window += 1
        
        if self.current_size == self.window_size and self.samples_since_last_window >= self.step_size:
            self.samples_since_last_window = 0
            return True
            
        return False

    def get_window(self):
        """
        Returns a copy of the current window.
        """
        if self.current_size < self.window_size:
            return None
        return self.buffer.copy()

    def reset(self):
        self.buffer = np.zeros((self.window_size, self.num_channels))
        self.current_size = 0
        self.samples_since_last_window = 0
