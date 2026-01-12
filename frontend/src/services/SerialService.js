// Simple Event Emitter for Browser
class MicroEventEmitter {
    constructor() {
        this._events = {};
    }

    on(event, listener) {
        if (!this._events[event]) this._events[event] = [];
        this._events[event].push(listener);
        return this;
    }

    off(event, listener) {
        if (!this._events[event]) return this;
        this._events[event] = this._events[event].filter(l => l !== listener);
        return this;
    }

    emit(event, ...args) {
        if (!this._events[event]) return false;
        this._events[event].forEach(listener => listener(...args));
        return true;
    }
}

// Protocol Constants
const SYNC1 = 0xC7;
const SYNC2 = 0x7C;
const END_BYTE = 0x01;
const PACKET_LEN = 8;
const BAUD_RATE = 230400;

export class SerialService extends MicroEventEmitter {
    constructor() {
        super();
        this.port = null;
        this.reader = null;
        this.readableStreamClosed = null;
        this.isConnected = false;
        this.keepReading = false;

        // Stats
        this.stats = {
            packetsReceived: 0,
            bytesReceived: 0,
            syncErrors: 0,
            startTime: 0
        };
    }

    async requestPort() {
        try {
            if (!navigator.serial) {
                throw new Error("Web Serial API not supported in this browser.");
            }
            const port = await navigator.serial.requestPort();
            return port;
        } catch (error) {
            console.error("Error requesting port:", error);
            throw error;
        }
    }

    async connect(port) {
        if (!port) throw new Error("No port provided");

        try {
            this.port = port;
            await this.port.open({ baudRate: BAUD_RATE });

            this.isConnected = true;
            this.keepReading = true;
            this.stats.startTime = Date.now();

            this.emit('connected');

            // Start reading loop
            this.readLoop();
            return true;
        } catch (error) {
            console.error("Connection failed:", error);
            this.isConnected = false;
            this.emit('error', error);
            return false;
        }
    }

    async disconnect() {
        this.keepReading = false;

        if (this.reader) {
            await this.reader.cancel();
            // The readLoop will finish and close the port
        }
    }

    async readLoop() {
        const bufferSize = 8192; // Internal buffer
        let buffer = new Uint8Array(bufferSize);
        let bufferIndex = 0;

        while (this.port && this.port.readable && this.keepReading) {
            this.reader = this.port.readable.getReader();
            try {
                while (this.keepReading) {
                    const { value, done } = await this.reader.read();
                    if (done) {
                        break;
                    }
                    if (value) {
                        // Append to buffer
                        // Note: For high performance, we might want a circular buffer or specialized structure
                        // But for < 100kB/s, moving bytes is fine.
                        this.stats.bytesReceived += value.length;

                        // Process incoming chunk
                        // We need to handle the case where buffer overflows, though unlikely with rapid processing
                        if (bufferIndex + value.length > buffer.byteLength) {
                            // Buffer overflow -> Resize
                            const newSize = Math.max(buffer.byteLength * 2, bufferIndex + value.length + 4096);
                            console.warn('[SerialService] Resizing buffer from', buffer.byteLength, 'to', newSize);
                            const newBuffer = new Uint8Array(newSize);
                            newBuffer.set(buffer.subarray(0, bufferIndex));
                            buffer = newBuffer;
                        }

                        // Copy new data
                        buffer.set(value, bufferIndex);
                        bufferIndex += value.length;

                        // Process Packets
                        const remainingIdx = this.processBuffer(buffer, bufferIndex);

                        // Shift remaining bytes to start
                        if (remainingIdx > 0 && remainingIdx < bufferIndex) {
                            buffer.copyWithin(0, remainingIdx, bufferIndex);
                            bufferIndex -= remainingIdx;
                        } else if (remainingIdx === bufferIndex) {
                            bufferIndex = 0;
                        }
                    }
                }
            } catch (error) {
                console.error("Read error:", error);
                this.emit('error', error);
            } finally {
                this.reader.releaseLock();
            }
        }

        if (this.port) {
            await this.port.close();
            this.isConnected = false;
            this.emit('disconnected');
        }
    }

    processBuffer(buffer, length) {
        let i = 0;
        let packets = [];

        // We need at least PACKET_LEN bytes
        while (i <= length - PACKET_LEN) {
            // Check Sync Header (0xC7, 0x7C)
            if (buffer[i] === SYNC1 && buffer[i + 1] === SYNC2) {
                // Check End Byte
                if (buffer[i + PACKET_LEN - 1] === END_BYTE) {
                    // Valid Packet Candidate
                    const packet = this.parsePacket(buffer, i);
                    packets.push(packet);

                    this.stats.packetsReceived++;
                    i += PACKET_LEN;
                } else {
                    // Invalid End Byte, skip 1
                    this.stats.syncErrors++;
                    i++;
                }
            } else {
                // Not synced
                i++;
            }
        }

        if (packets.length > 0) {
            this.emit('data', packets);
        }

        return i; // Return number of bytes processed
    }

    parsePacket(buffer, offset) {
        // Format: [Sync1, Sync2, Counter, CH0_H, CH0_L, CH1_H, CH1_L, End]
        const view = new DataView(buffer.buffer, buffer.byteOffset + offset, PACKET_LEN);

        const counter = view.getUint8(2);
        const ch0_raw = view.getUint16(3, false); // Big Endian
        const ch1_raw = view.getUint16(5, false); // Big Endian

        // Convert to uV (14-bit ADC, 3.3V Ref, centered at 1.65V)
        // Formula: ((adc / 2^14) * 3300) - 1650
        const ch0_uv = ((ch0_raw / 16384.0) * 3300.0) - 1650.0;
        const ch1_uv = ((ch1_raw / 16384.0) * 3300.0) - 1650.0;

        return {
            counter,
            ch0: ch0_uv, // Legacy / Backend compat
            ch1: ch1_uv,
            channels: {  // Frontend LiveView compat
                0: ch0_uv,
                1: ch1_uv
            },
            ch0_raw,
            ch1_raw,
            timestamp: Date.now()
        };
    }

    async send(data) {
        if (!this.port || !this.port.writable) {
            console.warn("Port not writable or not connected");
            return;
        }

        const writer = this.port.writable.getWriter();
        try {
            if (typeof data === 'string') {
                const encoder = new TextEncoder();
                await writer.write(encoder.encode(data));
            } else {
                await writer.write(data);
            }
            // console.log("Sent:", data);
        } catch (e) {
            console.error("Send error:", e);
        } finally {
            writer.releaseLock();
        }
    }

    async startAcquisition() {
        console.log("Sending Start Command (START)");
        await this.send('START\n');
    }

    async stopAcquisition() {
        console.log("Sending Stop Command (STOP)");
        await this.send('STOP\n');
    }
}

export const serialService = new SerialService();
