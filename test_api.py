import urllib.request
import urllib.parse
import json

url_load = "http://localhost:5005/api/models/emg/load"
data = json.dumps({"model_name": "emg_rf"}).encode('utf-8')
req = urllib.request.Request(url_load, data=data, headers={"Content-Type": "application/json"})

print(f"POST {url_load}")
try:
    with urllib.request.urlopen(req) as response:
        print("Status:", response.status)
        print("Response:", response.read().decode('utf-8'))
except Exception as e:
    print("Error:", e)

url_list = "http://localhost:5005/api/models/EMG"
print(f"\nGET {url_list}")
try:
    with urllib.request.urlopen(url_list) as response:
        print("Status:", response.status)
        print("Response:", response.read().decode('utf-8'))
except Exception as e:
    print("Error:", e)
