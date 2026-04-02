from src.learning.eeg_lda_trainer import train_eeg_lda_model

def test_eeg_training():
    print("Starting EEG LDA training test with synthetic session...")
    # Use the session we created
    # Table name should be 'eeg_session_synthetic_session_10k'
    table_name = "eeg_session_synthetic_session_10k"
    
    try:
        result = train_eeg_lda_model(
            table_name=table_name,
            model_name="test_synthetic_lda",
            k_folds=2, # Small k for speed
            search_resolution=1 # Minimal search for speed
        )
        if "error" in result:
            print(f"Training failed: {result['error']}")
        else:
            print(f"Training Successful! Accuracy: {result['test_accuracy']:.4f}")
            print(f"Model saved to: {result['model_path']}")
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"An exception occurred: {e}")

if __name__ == "__main__":
    test_eeg_training()
