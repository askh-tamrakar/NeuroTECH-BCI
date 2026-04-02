import random
import time
from datetime import datetime
from src.database.db_manager import DatabaseManager, COMPACT_EMG_FEATURE_COLUMNS

def generate_trial_id(index, start_hex="AA0BD1", samples_per_trial=5):
    """Generates a 6-digit hex trial ID starting from start_hex, incrementing every samples_per_trial."""
    start_val = int(start_hex, 16)
    trial_count = index // samples_per_trial
    current_val = start_val + trial_count
    return f"{current_val:06X}"

def generate_synthetic_data():
    db = DatabaseManager()
    num_entries = 10000
    samples_per_trial = 5
    start_trial_id = "AA0BD1"
    
    sensors = ["EMG", "EEG", "EOG"]
    session_name = "synthetic_session_10k"
    
    print(f"Starting synthetic data generation for {num_entries} entries per sensor...")

    for sensor in sensors:
        table_name = db.create_session_table(sensor, session_name)
        print(f"Created/Resolved table {table_name} for {sensor}")
        
        conn = db.connect(sensor)
        cursor = conn.cursor()
        
        rows = []
        timestamp_start = time.time() - num_entries
        
        for i in range(num_entries):
            timestamp = timestamp_start + i
            created_at = datetime.fromtimestamp(timestamp).strftime('%Y-%m-%d %H:%M:%S')
            session_id = session_name
            
            if sensor == "EMG":
                # EMG Schema
                # mav, rms, iemg, var, wl, zc, ssc, mean_freq, median_freq, spectral_entropy
                # d_ versions of the above
                trial_id = generate_trial_id(i, start_trial_id, samples_per_trial)
                class_label = random.randint(0, 5)
                
                features = [random.uniform(0, 1) for _ in range(10)] # Base features
                deltas = [random.uniform(-0.1, 0.1) for _ in range(10)] # Deltas
                
                # columns: mav, rms, iemg, var, wl, zc, ssc, mean_freq, median_freq, spectral_entropy, 
                # d_mav, d_rms, d_iemg, d_var, d_wl, d_zc, d_ssc, d_mean_freq, d_median_freq, d_spectral_entropy,
                # class_label, session_id, trial_id, timestamp, created_at
                row = (*features, *deltas, class_label, session_id, trial_id, timestamp, created_at)
                rows.append(row)
                
            elif sensor == "EEG":
                # EEG Schema
                # bp_delta..gamma (5), rel_delta..gamma (5), mean, std, max, min (4)
                # score_1..6 (6), max_score, second_max_score, score_ratio, score_mean, score_std (5)
                # dominant_freq, peak_freq, target_frequency (3)
                # channel_index, sample_count, window_ms (3)
                # metadata_json, class_label, session_id, trial_id, timestamp, created_at (6)
                
                trial_id = generate_trial_id(i, start_trial_id, samples_per_trial)
                class_label = random.randint(0, 5)
                target_freq = random.choice([3.5, 3.94, 5.25, 6.3, 7, 7.88])
                
                band_powers = [random.uniform(0, 50) for _ in range(5)]
                rel_powers = [random.uniform(0, 1) for _ in range(5)]
                stats = [random.uniform(-10, 10) for _ in range(4)]
                scores = [random.uniform(0, 1) for _ in range(6)]
                score_stats = [random.uniform(0, 1) for _ in range(5)]
                freqs = [random.uniform(3, 30), random.uniform(3, 30), target_freq]
                meta = [0, 512, 1500.0] # channel_index, sample_count, window_ms
                
                row = (*band_powers, *rel_powers, *stats, *scores, *score_stats, *freqs, *meta, "{}", class_label, session_id, trial_id, timestamp, created_at)
                rows.append(row)
                
            elif sensor == "EOG":
                # EOG Schema
                # amplitude, duration_ms, rise_time_ms, fall_time_ms, asymmetry, peak_count, kurtosis, skewness (8)
                # confidence, source, corrected_label (3)
                # label, session_id, timestamp, created_at (4)
                
                label = random.randint(0, 3)
                features = [random.uniform(10, 100), random.uniform(50, 500), random.uniform(10, 200), random.uniform(10, 200), random.uniform(-1, 1), random.randint(1, 3), random.uniform(1, 10), random.uniform(-2, 2)]
                meta = [random.uniform(0.7, 1.0), "synthetic", label]
                
                row = (*features, *meta, label, session_id, timestamp, created_at)
                rows.append(row)

        # Batch insert
        if sensor == "EMG":
            cursor.executemany(f'''
                INSERT INTO {table_name} (
                    mav, rms, iemg, var, wl, zc, ssc, mean_freq, median_freq, spectral_entropy,
                    d_mav, d_rms, d_iemg, d_var, d_wl, d_zc, d_ssc, d_mean_freq, d_median_freq, d_spectral_entropy,
                    class_label, session_id, trial_id, timestamp, created_at
                ) VALUES ({", ".join(["?"] * 25)})
            ''', rows)
        elif sensor == "EEG":
            cursor.executemany(f'''
                INSERT INTO {table_name} (
                    bp_delta, bp_theta, bp_alpha, bp_beta, bp_gamma,
                    rel_delta, rel_theta, rel_alpha, rel_beta, rel_gamma,
                    mean, std, max, min,
                    score_1, score_2, score_3, score_4, score_5, score_6,
                    max_score, second_max_score, score_ratio, score_mean, score_std,
                    dominant_freq, peak_freq, target_frequency,
                    channel_index, sample_count, window_ms,
                    metadata_json, class_label, session_id, trial_id, timestamp, created_at
                ) VALUES ({", ".join(["?"] * 37)})
            ''', rows)
        elif sensor == "EOG":
            cursor.executemany(f'''
                INSERT INTO {table_name} (
                    amplitude, duration_ms, rise_time_ms, fall_time_ms, asymmetry, peak_count, kurtosis, skewness,
                    confidence, source, corrected_label,
                    label, session_id, timestamp, created_at
                ) VALUES ({", ".join(["?"] * 15)})
            ''', rows)
            
        conn.commit()
        conn.close()
        print(f"Successfully inserted {len(rows)} entries into {table_name}")

if __name__ == "__main__":
    generate_synthetic_data()
