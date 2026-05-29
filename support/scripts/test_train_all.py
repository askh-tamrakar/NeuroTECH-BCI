import requests
import json
import sys

# Define base URL - assuming default Flask port
BASE_URL = "http://127.0.0.1:5000"

def test_train_all():
    print("Testing Training with table_name='ALL'...")
    try:
        # Payload for EMG training with ALL data
        payload = {
            "n_estimators": 10,
            "max_depth": 5,
            "test_size": 0.2,
            "table_name": "ALL",
            "model_name": "test_all_data_model",
            "sensor": "EMG"
        }
        
        # Endpoint
        url = f"{BASE_URL}/api/train-emg-rf"
        
        print(f"Sending POST to {url} with payload: {payload}")
        response = requests.post(url, json=payload)
        
        print(f"Status Code: {response.status_code}")
        try:
            print("Response:", json.dumps(response.json(), indent=2))
        except:
            print("Response Text:", response.text)
            
        if response.status_code == 200:
            data = response.json()
            if "n_samples" in data:
                print(f"SUCCESS: Trained on {data['n_samples']} samples.")
            else:
                print("WARNING: Response missing n_samples.")
        else:
            print("FAILURE: Request returned non-200 status.")

    except Exception as e:
        print(f"EXCEPTION: {e}")

if __name__ == "__main__":
    test_train_all()
