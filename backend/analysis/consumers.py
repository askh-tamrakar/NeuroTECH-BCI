import json
import logging
import sys
from channels.generic.websocket import AsyncWebsocketConsumer

def force_log(msg):
    sys.stdout.write(f"{msg}\n")
    sys.stdout.flush()

try:
    from core.feature.extractors.rps_extractor import RPSExtractor
    EXTRACTOR_AVAILABLE = True
except ImportError:
    EXTRACTOR_AVAILABLE = False
    force_log("[Consumer] Warning: RPSExtractor not available")

try:
    from core.processing.pipeline import ProcessingPipeline
    PIPELINE_AVAILABLE = True
except ImportError:
    PIPELINE_AVAILABLE = False
    force_log("[Consumer] Warning: Pipeline not available")

# Placeholder Detector if missing
class MockDetector:
    def detect(self, features): return None

try:
    # Attempt import (assuming core.detection or similar)
    from core.feature.detectors.rps_detector import RPSDetector
except ImportError:
    force_log("[Consumer] Warning: RPSDetector import failed. Using Mock.")
    RPSDetector = MockDetector

logger = logging.getLogger(__name__)

class SignalConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        print(f"[DEBUG] SignalConsumer.connect entered") # Direct debug
        try:
            # Initialize Pipeline first to get config
            if PIPELINE_AVAILABLE:
                self.pipeline = ProcessingPipeline()
                config = self.pipeline.config
            else:
                self.pipeline = None
                config = {}

            # Initialize Detector with config
            self.detector = RPSDetector(config)
            
            # Initialize Extractor for Channel 0 (EMG)
            if EXTRACTOR_AVAILABLE:
                self.extractor = RPSExtractor(channel_index=0, config=config, sr=512)
            else:
                self.extractor = None
                
            await self.accept()
            force_log(f"[SignalConsumer] WebSocket CONNECTED! Pipeline={bool(self.pipeline)}")
            logger.info("WebSocket Connected")
        except Exception as e:
            force_log(f"[SignalConsumer] Connection Crash: {e}")
            logger.error(f"WebSocket Connection Failed: {e}", exc_info=True)
            await self.close()

    async def disconnect(self, close_code):
        force_log(f"[SignalConsumer] Disconnected: {close_code}")
        pass

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
            msg_type = data.get('type')
            
            if msg_type == 'data':
                # force_log("[SignalConsumer] RX Data Packet") # Uncomment to debug flow
                
                # Handle Raw Data Stream from Frontend
                if not self.detector: # Pipeline optional but detector needed
                    return

                # Payload can be a single object or list of objects
                # Expected format: { timestamp: ..., ch0: ..., ch1: ... }
                payload = data.get('payload')
                if not payload:
                    return
                
                # Normalize to list
                samples = payload if isinstance(payload, list) else [payload]
                
                prediction_to_send = None
                processed_samples = []
                
                for sample in samples:
                    # 1. Filter Sample
                    if self.pipeline:
                        # Process dict -> dict
                        processed_sample = self.pipeline.process_sample(sample)
                    else:
                        processed_sample = sample
                    
                    processed_samples.append(processed_sample)

                    # 2. Extract Features (from Filtered Data)
                    # Extract CH0 value (EMG)
                    if self.extractor:
                        val = processed_sample.get('ch0') or processed_sample.get(0)
                        if val is not None:
                            features = self.extractor.process(float(val))
                            
                            if features:
                                # Window aligned, detect!
                                prediction = self.detector.detect(features)
                                if prediction:
                                    prediction_to_send = prediction
                
                # 3. Send Back Predictions
                if prediction_to_send:
                    force_log(f"[SignalConsumer] Prediction: {prediction_to_send}")
                    await self.send(text_data=json.dumps({
                        'type': 'prediction',
                        'payload': prediction_to_send
                    }))
                    
                # 4. Send Back Processed Data (for Visualization)
                # We interpret this as 'processed_stream'
                # To match Frontend 'bio_data_update' or 'signal_update'
                # Simplest is to mirror the structure but with filtered values.
                if processed_samples:
                     # force_log(f"[SignalConsumer] Relaying {len(processed_samples)} samples") 
                     # Commented out to avoid spam, uncomment if needed.
                     # But user wants to SEE logs. Let's print every 100th batch or simply print '.'?
                     # Printing every batch is too much at 250Hz?
                     # Frontend sends batches (e.g. 10-50 samples).
                     # Printing "Relaying 10 samples" 20 times a second is readable.
                     force_log(f"[SignalConsumer] Processed batch of {len(processed_samples)}")
                     
                     await self.send(text_data=json.dumps({
                        'type': 'bio_data_update',
                        # Frontend expects `_batch` or `channels`
                        'payload': {
                             '_batch': processed_samples,
                             'stream_name': 'Backend-Processed'
                        }
                    }))

            elif msg_type == 'features':
                # ... legacy ...
                features = data.get('payload')
                prediction = self.detector.detect(features)
                
                if prediction:
                    await self.send(text_data=json.dumps({
                        'type': 'prediction',
                        'payload': prediction
                    }))
            
            elif msg_type == 'ping':
                await self.send(text_data=json.dumps({'type': 'pong'}))
                
        except Exception as e:
            # Silence high-freq errors to avoid log spam, or log only type
            force_log(f"[SignalConsumer] Error processing: {e}")
            logger.debug(f"Error processing message: {e}")
