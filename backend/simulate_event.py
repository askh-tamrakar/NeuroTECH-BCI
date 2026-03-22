import pylsl
import json
import time

def main():
    info = pylsl.StreamInfo('BioSignals-Events', 'Markers', 1, 0, 'string', 'SimUnits123')
    outlet = pylsl.StreamOutlet(info)
    
    print("Simulating TARGET_6_0HZ in 2 seconds...")
    time.sleep(2)
    
    event_data = {
        "event": "TARGET_6_0HZ",
        "channel": "ch0",
        "timestamp": time.time(),
        "features": {}
    }
    
    outlet.push_sample([json.dumps(event_data)])
    print("Sent TARGET_10_0HZ")

if __name__ == "__main__":
    main()
