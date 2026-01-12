import json
import logging
from channels.generic.websocket import AsyncWebsocketConsumer

try:
    from backend.core.feature.extractors.rps_extractor import RPSExtractor
    EXTRACTOR_AVAILABLE = True
except ImportError:
    EXTRACTOR_AVAILABLE = False

try:
    from backend.core.processing.pipeline import ProcessingPipeline
    PIPELINE_AVAILABLE = True
except ImportError:
    PIPELINE_AVAILABLE = False

# Placeholder Detector if missing
class MockDetector:
    def detect(self, features): return None

try:
    # Attempt import (assuming core.detection or similar)
    from backend.core.detection.rps_detector import RPSDetector
except ImportError:
    print("[Consumer] Warning: RPSDetector import failed. Using Mock.")
    RPSDetector = MockDetector

logger = logging.getLogger(__name__)

class SignalConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        try:
            self.detector = RPSDetector()
            
            # Initialize Pipeline
            if PIPELINE_AVAILABLE:
                self.pipeline = ProcessingPipeline()
            else:
                self.pipeline = None

            # Initialize Extractor for Channel 0 (EMG)
            if EXTRACTOR_AVAILABLE:
                # Note: RPSExtractor might expect config. logic
                self.extractor = RPSExtractor(channel_index=0, config={}, sr=512)
            else:
                self.extractor = None
                
            await self.accept()
            logger.info("WebSocket Connected")
        except Exception as e:
            logger.error(f"WebSocket Connection Failed: {e}", exc_info=True)
            await self.close()

    async def disconnect(self, close_code):
        pass

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
            msg_type = data.get('type')
            
            if msg_type == 'data':
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
                    print(f"[SignalConsumer] Sending Prediction: {prediction_to_send}")
                    await self.send(text_data=json.dumps({
                        'type': 'prediction',
                        'payload': prediction_to_send
                    }))
                    
                # 4. Send Back Processed Data (for Visualization)
                # We interpret this as 'processed_stream'
                # To match Frontend 'bio_data_update' or 'signal_update'
                # Simplest is to mirror the structure but with filtered values.
                if processed_samples:
                     # print(f"[SignalConsumer] Sending {len(processed_samples)} backend-processed samples")
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
            print(f"[SignalConsumer] Error processing message: {e}")
            logger.debug(f"Error processing message: {e}")
