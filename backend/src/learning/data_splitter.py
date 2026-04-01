from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

import numpy as np
import pandas as pd
from sklearn.model_selection import StratifiedKFold, train_test_split

from src.database.db_manager import db_manager


@dataclass
class SplitBundle:
    train_val_df: pd.DataFrame
    test_df: pd.DataFrame
    feature_cols: list[str]
    label_col: str
    group_col: str | None
    split_mode: str


def _resolve_group_col(sensor: str, df: pd.DataFrame) -> tuple[str | None, str]:
    sensor = sensor.upper()
    if sensor in {"EMG", "EEG"}:
        if "trial_group_id" in df.columns and df["trial_group_id"].astype(str).str.strip().ne("").any():
            return "trial_group_id", "trial"
        if "session_id" in df.columns and df["session_id"].astype(str).str.strip().ne("").any():
            return "session_id", "session"
        raise ValueError(f"{sensor} grouped split requires trial_group_id or session_id.")
    return None, "row"


def load_sensor_dataset(
    sensor: str,
    table_name: str,
    feature_cols: list[str],
    label_col: str = "label",
    row_filter: Callable[[pd.DataFrame, str], pd.DataFrame] | None = None,
) -> pd.DataFrame:
    sensor = sensor.upper()
    conn = db_manager.connect(sensor)
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table_name,))
        if not cursor.fetchone():
            raise ValueError(f"Table {table_name} not found")
        df = pd.read_sql_query(f"SELECT * FROM {table_name}", conn)
    finally:
        conn.close()

    if row_filter is not None:
        df = row_filter(df, table_name)

    if df.empty:
        raise ValueError("Database is empty. Collect data first.")

    for col in feature_cols:
        if col not in df.columns:
            df[col] = 0.0
    df = df[df[label_col].notna()].copy()
    if df.empty:
        raise ValueError("No labeled rows available after preprocessing.")
    return df


def build_train_val_test_split(
    sensor: str,
    df: pd.DataFrame,
    feature_cols: list[str],
    train_ratio: float,
    val_ratio: float,
    test_ratio: float,
    random_state: int = 42,
    label_col: str = "label",
) -> SplitBundle:
    total = float(train_ratio) + float(val_ratio) + float(test_ratio)
    if total <= 0:
        raise ValueError("Split ratios must sum to a positive value.")
    train_ratio = float(train_ratio) / total
    val_ratio = float(val_ratio) / total
    test_ratio = float(test_ratio) / total
    if test_ratio <= 0 or train_ratio <= 0 or val_ratio <= 0:
        raise ValueError("Train, validation, and test ratios must all be greater than zero.")

    group_col, split_mode = _resolve_group_col(sensor, df)
    sensor = sensor.upper()

    if group_col:
        group_frame = (
            df[[group_col, label_col]]
            .assign(**{group_col: df[group_col].astype(str).str.strip()})
            .groupby(group_col, as_index=False)[label_col]
            .agg(lambda values: int(pd.Series(values).mode().iloc[0]))
        )
        if group_frame.empty or group_frame[label_col].nunique() < 2:
            raise ValueError(f"{sensor} requires at least 2 grouped classes to split.")

        train_groups, test_groups = train_test_split(
            group_frame[group_col],
            test_size=test_ratio,
            random_state=random_state,
            stratify=group_frame[label_col],
        )
        train_groups = set(train_groups.tolist())
        test_groups = set(test_groups.tolist())
        train_val_df = df[df[group_col].astype(str).isin(train_groups)].copy()
        test_df = df[df[group_col].astype(str).isin(test_groups)].copy()
    else:
        train_val_df, test_df = train_test_split(
            df,
            test_size=test_ratio,
            random_state=random_state,
            stratify=df[label_col],
        )
        train_val_df = train_val_df.copy()
        test_df = test_df.copy()

    if train_val_df.empty or test_df.empty:
        raise ValueError("Split produced an empty partition. Collect more data or adjust ratios.")

    return SplitBundle(
        train_val_df=train_val_df,
        test_df=test_df,
        feature_cols=list(feature_cols),
        label_col=label_col,
        group_col=group_col,
        split_mode=split_mode,
    )


def iter_cv_folds(
    split_bundle: SplitBundle,
    n_splits: int,
    random_state: int = 42,
):
    df = split_bundle.train_val_df
    label_col = split_bundle.label_col
    group_col = split_bundle.group_col
    y = df[label_col].astype(int)

    if group_col:
        grouped = (
            df[[group_col, label_col]]
            .assign(**{group_col: df[group_col].astype(str).str.strip()})
            .groupby(group_col, as_index=False)[label_col]
            .agg(lambda values: int(pd.Series(values).mode().iloc[0]))
        )
        if len(grouped) < n_splits:
            raise ValueError(f"Need at least {n_splits} groups for grouped {n_splits}-fold tuning.")
        splitter = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=random_state)
        for fold_index, (train_idx, val_idx) in enumerate(splitter.split(grouped[group_col], grouped[label_col]), start=1):
            train_groups = set(grouped.iloc[train_idx][group_col].astype(str).tolist())
            val_groups = set(grouped.iloc[val_idx][group_col].astype(str).tolist())
            train_df = df[df[group_col].astype(str).isin(train_groups)].copy()
            val_df = df[df[group_col].astype(str).isin(val_groups)].copy()
            yield fold_index, train_df, val_df
    else:
        if len(df) < n_splits:
            raise ValueError(f"Need at least {n_splits} rows for {n_splits}-fold tuning.")
        splitter = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=random_state)
        X = df[split_bundle.feature_cols]
        for fold_index, (train_idx, val_idx) in enumerate(splitter.split(X, y), start=1):
            train_df = df.iloc[train_idx].copy()
            val_df = df.iloc[val_idx].copy()
            yield fold_index, train_df, val_df


def split_summary(split_bundle: SplitBundle, k_folds: int | None = None) -> dict:
    train_val_df = split_bundle.train_val_df
    test_df = split_bundle.test_df
    group_col = split_bundle.group_col
    total_samples = int(len(train_val_df)) + int(len(test_df))

    summary = {
        "total_samples": total_samples,
        "train_val_samples": int(len(train_val_df)),
        "test_samples": int(len(test_df)),
        "split_mode": split_bundle.split_mode,
    }

    if k_folds and k_folds > 0:
        val_size = int(len(train_val_df)) // k_folds
        summary["val_samples"] = val_size
        summary["train_samples"] = int(len(train_val_df)) - val_size
    else:
        # Fallback if no k_folds provided
        summary["val_samples"] = 0
        summary["train_samples"] = int(len(train_val_df))

    if group_col:
        summary["train_val_groups"] = int(train_val_df[group_col].astype(str).nunique())
        summary["test_groups"] = int(test_df[group_col].astype(str).nunique())
        summary["group_column"] = group_col
    return summary
