import asyncio
import json
import random
# Requires: pip install websockets
import websockets

async def test_websocket_flow():
    uri = "ws://localhost:8000/ws/signal/"
    print(f"Connecting to {uri}...")
    
    try:
        async with websockets.connect(uri) as websocket:
            print("Connected!")
            
            # 1. Send simulated raw data
            # Format: { 'type': 'signal', 'payload': ... } depends on consumer
            # The SignalConsumer expects just raw JSON or specific format?
            # Looking at code: it expects JSON. If 'type' is missing, treats as data?
            # Actually, `receive` parses JSON.
            # If it has 'stream_name' it might loop back.
            
            payload = {
                "ch0": 0.5,
                "ch1": 0.1,
                "timestamp": 123456789
            }
            
            print(f"Sending: {payload}")
            await websocket.send(json.dumps(payload))
            
            # 2. Wait for response
            while True:
                response = await websocket.recv()
                data = json.loads(response)
                
                # Check for "Backend-Processed"
                if data.get('payload', {}).get('stream_name') == 'Backend-Processed':
                    print("\n✅ SUCCESS: Received Processed Data!")
                    print(f"Response: {data}")
                    break
                else:
                    print(f"Received other message: {data.keys()}")
                    
    except Exception as e:
        print(f"❌ WebSocket Test Failed: {e}")
        print("Note: Ensure server is running (python manage.py runserver)")

if __name__ == "__main__":
    try:
        asyncio.run(test_websocket_flow())
    except ImportError:
        print("Please install 'websockets' to run this test: pip install websockets")
