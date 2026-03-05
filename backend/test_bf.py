import time
import brainflow
from brainflow.board_shim import BoardShim, BrainFlowInputParams, BoardIds
params = BrainFlowInputParams()
board = BoardShim(BoardIds.SYNTHETIC_BOARD, params)
board.prepare_session()
board.start_stream()
time.sleep(1)
data = board.get_board_data()
board.stop_stream()
board.release_session()
eeg = board.get_eeg_channels(BoardIds.SYNTHETIC_BOARD)
print(data[eeg[0]][:10])
print(data[eeg[1]][:10])
