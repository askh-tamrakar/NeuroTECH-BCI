class BubbleGameModule:
    """
    Minimal module for the Bubble Game.
    The Bubble Game logic (popping bubbles based on beta threshold) is primarily
    handled on the frontend using the raw spectral features (band_powers) sent
    by the ModeManager. This module returns an empty output structure to maintain
    pipeline compatibility.
    """
    def __init__(self):
        pass

    def process(self, features):
        return {}
