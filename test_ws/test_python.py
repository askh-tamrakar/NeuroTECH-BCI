import socketio
import time
import sys

sio = socketio.Client(reconnection=True)
count = 0

@sio.event
def connect():
    print("Connected to server")

@sio.on('bio_data_batch')
def bio_data_batch(data):
    global count
    print(f"\n--- bio_data_batch #{count + 1} ---")
    print(f"Sample Rate: {data.get('sample_rate')}")
    print(f"Batch Size: {data.get('batch_size')}")
    if 'samples' in data and len(data['samples']) > 0:
        first_sample = data['samples'][0]
        print(f"First Sample Channels: {first_sample.get('channels')}")
    count += 1
    if count >= 3:
        sio.disconnect()
        sys.exit(0)

@sio.event
def disconnect():
    print("Disconnected from server")

try:
    sio.connect('http://localhost:5005')
    sio.wait()
except Exception as e:
    print(f"Connection failed: {e}")
