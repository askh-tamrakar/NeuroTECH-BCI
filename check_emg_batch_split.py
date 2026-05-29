import sqlite3
import pandas as pd
from sklearn.model_selection import GroupShuffleSplit, GroupKFold

def check_batch_split():
    db_path = r'E:\WebSite\NeuroTECH-BCI\data\EMG\processed\emg_data.db'
    table_name = 'emg_session_Neuro'
    
    print(f"Connecting to database: {db_path}")
    conn = sqlite3.connect(db_path)
    
    try:
        # Load the data from the neuro table
        df = pd.read_sql_query(f"SELECT * FROM {table_name}", conn)
        print(f"Loaded {len(df)} rows from {table_name}")
    except Exception as e:
        print(f"Error loading data: {e}")
        return
    finally:
        conn.close()
        
    if 'batch_id' not in df.columns:
        print("Error: 'batch_id' column not found in the table.")
        return
        
    # Drop rows without batch_id for the purpose of the test
    df = df.dropna(subset=['batch_id'])
    
    unique_batches = df['batch_id'].nunique()
    print(f"Total unique batch_ids: {unique_batches}")
    
    if unique_batches < 2:
        print("Not enough unique batch_ids to perform a split (need at least 2).")
        return

    # Simulate Train/Test Split based on batch_id
    test_size = 0.2
    gss = GroupShuffleSplit(n_splits=1, test_size=test_size, random_state=42)
    
    print("\n--- Simulating Train/Test Split ---")
    train_idx, test_idx = next(gss.split(df, groups=df['batch_id']))
    
    train_df = df.iloc[train_idx]
    test_df = df.iloc[test_idx]
    
    train_batches = set(train_df['batch_id'].unique())
    test_batches = set(test_df['batch_id'].unique())
    
    overlap = train_batches.intersection(test_batches)
    
    print(f"Train set size: {len(train_df)} rows, {len(train_batches)} batches")
    print(f"Test set size: {len(test_df)} rows, {len(test_batches)} batches")
    
    if len(overlap) == 0:
        print("SUCCESS: No overlapping batch_ids between Train and Test sets.")
    else:
        print(f"FAILURE: Found overlapping batch_ids: {overlap}")
        
    # Simulate Cross Validation Folds based on batch_id (Train/Val split)
    n_folds = min(5, len(train_batches))
    if n_folds > 1:
        print(f"\n--- Simulating {n_folds}-Fold Cross Validation on Train Set ---")
        gkf = GroupKFold(n_splits=n_folds)
        
        for fold, (t_idx, v_idx) in enumerate(gkf.split(train_df, groups=train_df['batch_id'])):
            fold_train = train_df.iloc[t_idx]
            fold_val = train_df.iloc[v_idx]
            
            f_train_batches = set(fold_train['batch_id'].unique())
            f_val_batches = set(fold_val['batch_id'].unique())
            
            f_overlap = f_train_batches.intersection(f_val_batches)
            
            print(f"Fold {fold+1}: Train={len(f_train_batches)} batches, Val={len(f_val_batches)} batches. Overlap={len(f_overlap)}")
            if len(f_overlap) > 0:
                print(f"  WARNING: Fold {fold+1} has overlapping batches!")

if __name__ == "__main__":
    check_batch_split()
