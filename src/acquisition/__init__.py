from .serial_reader import SerialPacketReader
from .packet_parser import PacketParser, Packet
from .lsl_streams import LSLStreamer, LSL_AVAILABLE
from .acquisition_app import AcquisitionWindow 

__all__ = [
    "SerialPacketReader",
    "PacketParser",
    "Packet",
    "LSLStreamer",
    "LSL_AVAILABLE",
    "AcquisitionWindow"
]

def __getattr__(name):
    if name == 'acquisition_app':
        from . import acquisition_app
        return acquisition_app
    elif name == 'serial_reader':
        from . import serial_reader
        return serial_reader
    elif name == 'packet_parser':
        from . import packet_parser
        return packet_parser
    elif name == 'lsl_streams':
        from . import lsl_streams
        return lsl_streams
    raise AttributeError(f"module '{__name__}' has no attribute '{name}'")