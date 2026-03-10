import requests
import sys

BASE_URL = "http://127.0.0.1:5000/api"

def test_eog_list():
    try:
        response = requests.get(f"{BASE_URL}/models/eog")
        if response.status_code == 200:
            print("SUCCESS: /api/models/eog returned 200")
            print("Models:", response.json())
        else:
            print(f"FAILURE: /api/models/eog returned {response.status_code}")
            print(response.text)
    except Exception as e:
        print(f"ERROR: Could not connect to API: {e}")

if __name__ == "__main__":
    test_eog_list()
