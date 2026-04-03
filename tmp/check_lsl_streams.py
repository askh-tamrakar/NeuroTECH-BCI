import pylsl
import time

def main():
    print("🔍 Searching for LSL streams...")
    streams = pylsl.resolve_streams(wait_time=2.0)
    
    if not streams:
        print("❌ No LSL streams found!")
        return

    print(f"✅ Found {len(streams)} streams:")
    for i, s in enumerate(streams):
        print(f"  [{i}] {s.name()} ({s.type()}) - Ch: {s.channel_count()} @ {s.nominal_srate()}Hz on {s.hostname()}")
        
        # Try to peek at data for BioSignals-Processed
        if s.name() == "BioSignals-Processed":
            try:
                inlet = pylsl.StreamInlet(s)
                sample, ts = inlet.pull_sample(timeout=1.0)
                if sample:
                    print(f"      📡 DATA FLOWING: Sample size {len(sample)}, First Val: {sample[0]:.2f}")
                else:
                    print("      ⚠️  NO DATA pulled from stream.")
            except Exception as e:
                print(f"      ❌ Error peeking at stream: {e}")

if __name__ == "__main__":
    main()
