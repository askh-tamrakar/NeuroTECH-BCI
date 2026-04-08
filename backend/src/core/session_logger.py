"""
Session Logger module for Unified EEG Platform.
Logs feature vectors and model states for post-hoc analysis.
"""
import os
import csv
import time
import logging

log = logging.getLogger(__name__)

class SessionLogger:
    def __init__(self, log_dir="logs"):
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        self.log_dir = os.path.join(base_dir, log_dir)
        os.makedirs(self.log_dir, exist_ok=True)
        
        self.active_log_file = None
        self.writer = None
        
    def start_session(self, preset, view):
        timestamp = time.strftime("%Y%m%d-%H%M%S")
        filename = f"session_{preset}_{view}_{timestamp}.csv"
        self.active_log_file = open(os.path.join(self.log_dir, filename), 'w', newline='')
        self.writer = csv.writer(self.active_log_file)
        
        # Write header
        self.writer.writerow([
            "timestamp", "delta", "theta", "alpha", "beta", "gamma", 
            "theta_beta_ratio", "alpha_beta_ratio", "beta_alpha_ratio", 
            "alpha_theta_ratio", "calm_index", "stress_index", 
            "engagement_index", "gamma_beta_ratio", "state_output"
        ])
        log.info(f"Started session logging to {filename}")
        
    def log_features(self, features, output_state):
        if self.writer and self.active_log_file:
            row = [time.time()] + features + [str(output_state)]
            self.writer.writerow(row)
            
    def end_session(self):
        if self.active_log_file:
            self.active_log_file.close()
            self.active_log_file = None
            self.writer = None
            log.info("Session logging ended.")
