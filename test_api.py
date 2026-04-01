import requests
import time
import pprint

data = {
    "table_name": "emg_windows",
    "sensor": "EMG",
    "train_ratio": 0.7,
    "val_ratio": 0.15,
    "test_ratio": 0.15,
    "n_estimators": 100,
    "max_depth": 10,
    "k_folds": 5, 
    "search_resolution": 3
}
try:
    res = requests.post("http://127.0.0.1:5005/api/train-emg-rf", json=data).json()
    jid = res.get('job_id')
    print("JOB ID:", jid)
    if not jid:
        print("Error no job ID:", res)
    for _ in range(10):
        time.sleep(0.5)
        status = requests.get(f"http://127.0.0.1:5005/api/train-jobs/{jid}").json()
        print("STATUS:", status.get('status'))
        if status.get('status') in ['failed', 'completed']:
            print(status.get('error'))
            break
except Exception as e:
    print("Error:", e)
