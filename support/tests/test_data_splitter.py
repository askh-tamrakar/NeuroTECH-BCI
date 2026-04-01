import unittest

import pandas as pd

from backend.src.learning.data_splitter import build_train_val_test_split


class DataSplitterTests(unittest.TestCase):
    def test_emg_grouped_split_keeps_trial_groups_separate(self):
        df = pd.DataFrame({
            "trial_group_id": ["g1", "g1", "g2", "g2", "g3", "g3", "g4", "g4"],
            "label": [0, 0, 1, 1, 2, 2, 3, 3],
            "mav": [0.1] * 8,
            "rms": [0.2] * 8,
        })
        split = build_train_val_test_split("EMG", df, ["mav", "rms"], 0.7, 0.15, 0.15, random_state=42)
        train_groups = set(split.train_val_df["trial_group_id"].astype(str).tolist())
        test_groups = set(split.test_df["trial_group_id"].astype(str).tolist())
        self.assertTrue(train_groups.isdisjoint(test_groups))
        self.assertEqual(split.split_mode, "trial")

    def test_eeg_grouped_split_uses_trial_group_id(self):
        df = pd.DataFrame({
            "trial_group_id": ["t1", "t1", "t2", "t2", "t3", "t3", "t4", "t4"],
            "label": [1, 1, 2, 2, 3, 3, 0, 0],
            "score_1": [0.1] * 8,
            "peak_freq": [8.0] * 8,
        })
        split = build_train_val_test_split("EEG", df, ["score_1", "peak_freq"], 0.7, 0.15, 0.15, random_state=42)
        self.assertEqual(split.split_mode, "trial")
        self.assertTrue(set(split.train_val_df["trial_group_id"]).isdisjoint(set(split.test_df["trial_group_id"])))

    def test_eog_row_split_returns_row_mode(self):
        df = pd.DataFrame({
            "label": [0, 0, 1, 1, 2, 2, 1, 0],
            "amplitude": [1.0] * 8,
            "duration_ms": [100.0] * 8,
        })
        split = build_train_val_test_split("EOG", df, ["amplitude", "duration_ms"], 0.7, 0.15, 0.15, random_state=42)
        self.assertEqual(split.split_mode, "row")
        self.assertGreater(len(split.train_val_df), len(split.test_df))


if __name__ == "__main__":
    unittest.main()
