import pylsl
import json
import time

def test_hid():
    info = pylsl.StreamInfo('BioSignals-Events', 'Markers', 1, 0, 'string', 'BioEventsTest')
    outlet = pylsl.StreamOutlet(info)
    
    print("Simulating TARGET_20_0HZ in 2 seconds...")
    time.sleep(2)
    
    event = {
        "event": "TARGET_20_0HZ",
        "channel": "ch1",
        "timestamp": time.time(),
        "features": {}
    }
    outlet.push_sample([json.dumps(event)])
    print("Event sent. Check hid_controller logs.")

if __name__ == "__main__":
    test_hid()
