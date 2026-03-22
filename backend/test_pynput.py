from pynput.keyboard import Controller, Key
import time

def test_keys():
    keyboard = Controller()
    print("Testing pynput in 3 seconds... (Switch to a text editor!)")
    time.sleep(3)
    
    print("Pressing 'w'...")
    keyboard.press('w')
    time.sleep(0.1)
    keyboard.release('w')
    
    print("Pressing 'Space'...")
    keyboard.press(Key.space)
    time.sleep(0.1)
    keyboard.release(Key.space)
    
    print("Test complete.")

if __name__ == "__main__":
    test_keys()
