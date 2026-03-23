import re

with open('src/processing/filter_router.py', 'r', encoding='utf-8') as f:
    code = f.read()

# Replace block 1
old_block1 = """        # Clean up old configuration
        self.channel_processors = {}
        self.channel_mapping = {}
        
        # ========== IMPROVED: Explicitly close old outlet ==========
        # Connect to Stream Manager (Processed)
        if self.stream_socket:
            try:
                self.stream_socket.close()
            except:
                pass
        self.stream_socket = None
        self.stream_connected = False
        
        # Retry connection loop to avoid startup race conditions
        max_retries = 5
        for attempt in range(max_retries):
            try:
                self.stream_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                self.stream_socket.connect(('localhost', 6001))
                self.stream_connected = True"""

new_block1 = """        # Preserve old processors to avoid destroying filter states (zi) on mapping changes
        old_processors = self.channel_processors
        self.channel_processors = {}
        self.channel_mapping = {}
        
        # ========== IMPROVED: Keep socket alive if already connected ==========
        # Connect to Stream Manager (Processed)
        if not self.stream_socket or not self.stream_connected:
            max_retries = 5
            for attempt in range(max_retries):
                try:
                    self.stream_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                    self.stream_socket.connect(('localhost', 6001))
                    self.stream_connected = True"""

if old_block1 in code:
    code = code.replace(old_block1, new_block1)
    print("Block 1 replaced successfully.")
else:
    print("Block 1 NOT FOUND.")

# Replace block 2
old_block2 = """                    # Create processor instance for this channel
                    if sensor_type == "EMG":
                        self.channel_processors[i] = EMGFilterProcessor(self.config, self.sr, channel_key=ch_key)
                        env_status = "ENABLED" if getattr(self.channel_processors[i], 'envelope_enabled', False) else "DISABLED"
                        print(f"[Router] [{i}] → EMG (EMG Processor) | Key: {ch_key} | Enveloping: {env_status}")
                    
                    elif sensor_type == "EOG":
                        self.channel_processors[i] = EOGFilterProcessor(self.config, self.sr, channel_key=ch_key)
                        print(f"[Router] [{i}] → EOG (EOG Processor) | Key: {ch_key}")
                    
                    elif sensor_type == "EEG":
                        self.channel_processors[i] = EEGFilterProcessor(self.config, self.sr, channel_key=ch_key)
                        print(f"[Router] [{i}] → EEG (EEG Processor) | Key: {ch_key}")
                    
                    else:
                        # Unknown type - pass-through
                        self.channel_processors[i] = None
                        print(f"[Router] [{i}] → {sensor_type} (Unknown - Pass-through)")"""

new_block2 = """                    # Try to reuse existing processor to prevent filter state resets
                    existing_proc = old_processors.get(i)
                    if existing_proc and existing_proc.__class__.__name__.startswith(sensor_type):
                        self.channel_processors[i] = existing_proc
                        # Also update config just in case
                        if hasattr(existing_proc, 'update_config'):
                            existing_proc.update_config(self.config, self.sr)
                        print(f"[Router] [{i}] → {sensor_type} (REUSED Processor) | Key: {ch_key}")
                    else:
                        # Create NEW processor instance for this channel
                        if sensor_type == "EMG":
                            self.channel_processors[i] = EMGFilterProcessor(self.config, self.sr, channel_key=ch_key)
                            env_status = "ENABLED" if getattr(self.channel_processors[i], 'envelope_enabled', False) else "DISABLED"
                            print(f"[Router] [{i}] → EMG (EMG Processor) | Key: {ch_key} | Enveloping: {env_status}")
                        
                        elif sensor_type == "EOG":
                            self.channel_processors[i] = EOGFilterProcessor(self.config, self.sr, channel_key=ch_key)
                            print(f"[Router] [{i}] → EOG (EOG Processor) | Key: {ch_key}")
                        
                        elif sensor_type == "EEG":
                            self.channel_processors[i] = EEGFilterProcessor(self.config, self.sr, channel_key=ch_key)
                            print(f"[Router] [{i}] → EEG (EEG Processor) | Key: {ch_key}")
                        
                        else:
                            # Unknown type - pass-through
                            self.channel_processors[i] = None
                            print(f"[Router] [{i}] → {sensor_type} (Unknown - Pass-through)")"""

if old_block2 in code:
    code = code.replace(old_block2, new_block2)
    print("Block 2 replaced successfully.")
else:
    print("Block 2 NOT FOUND.")

with open('src/processing/filter_router.py', 'w', encoding='utf-8') as f:
    f.write(code)

print('Done')
