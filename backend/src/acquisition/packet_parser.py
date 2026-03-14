from dataclasses import dataclass, asdict
from typing import Optional, List, Tuple
from datetime import datetime
import struct
import numpy as np

@dataclass
class Packet:
    timestamp_ms: int
    ch0_raw: np.ndarray

class PacketParser:
    def __init__(self, packet_len: int = 519):
        self.packet_len = packet_len
        # Format: B (Sync1), B (Sync2), <I (Timestamp), 256x <H (CH0 samples), B (End)
        self._struct_fmt = "<I256H" # Timestamp, 256 samples

    def parse(self, packet_bytes: bytes) -> Packet:
        if not packet_bytes or len(packet_bytes) != self.packet_len:
            raise ValueError(f"Invalid packet length")
        
        # Unpack starting from index 2 (skip sync bytes)
        unpacked = struct.unpack_from(self._struct_fmt, packet_bytes, 2)
        timestamp_ms = unpacked[0]
        ch0_vals = np.array(unpacked[1:], dtype=np.uint16)
        
        return Packet(timestamp_ms=timestamp_ms, ch0_raw=ch0_vals)

    def parse_batch(self, batch_bytes: List[bytes]) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        """
        Parse a list of byte packets into numpy arrays for speed.
        Returns (timestamps, ch0_raw, ch1_raw)
        ch1_raw is returned as zeros for backwards compatibility.
        """
        n_packets = len(batch_bytes)
        n_samples = n_packets * 256
        
        timestamps = np.zeros(n_samples, dtype=np.uint32)
        ch0_raw = np.zeros(n_samples, dtype=np.uint16)
        ch1_raw = np.zeros(n_samples, dtype=np.uint16)

        idx = 0
        for pkt in batch_bytes:
            unpacked = struct.unpack_from(self._struct_fmt, pkt, 2)
            ts = unpacked[0]
            vals = unpacked[1:]
            
            # Since all 256 samples happened roughly over the last 256ms,
            # we fill the timestamp array with same timestamp or interpolated.
            # Using same timestamp for the chunk is simplest backward-compatible.
            timestamps[idx:idx+256] = ts
            ch0_raw[idx:idx+256] = vals
            idx += 256

        return timestamps, ch0_raw, ch1_raw
