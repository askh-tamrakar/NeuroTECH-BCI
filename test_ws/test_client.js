const { io } = require("socket.io-client");

const socket = io("http://localhost:5000", {
    reconnection: true,
    transports: ["websocket", "polling"],
});

let batchCount = 0;
let updateCount = 0;

socket.on("connect", () => {
    console.log("Connected to WebSocket server");
});

socket.on("bio_data_batch", (data) => {
    if (batchCount < 2) {
        console.log(`\n--- bio_data_batch #${batchCount + 1} ---`);
        console.log(JSON.stringify(data, null, 2));
        batchCount++;
    }
    if (batchCount >= 2 && updateCount >= 2) process.exit(0);
});

socket.on("bio_data_update", (data) => {
    if (updateCount < 2) {
        console.log(`\n--- bio_data_update #${updateCount + 1} ---`);
        console.log(JSON.stringify(data, null, 2));
        updateCount++;
    }
    if (batchCount >= 2 && updateCount >= 2) process.exit(0);
});

socket.on("connect_error", (error) => {
    console.error("Connection error:", error.message);
});

// timeout after 5 seconds
setTimeout(() => {
    console.log("Timeout reached. Exiting.");
    process.exit(1);
}, 5000);
