import express from "express";
import cors from "cors";
import { makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } from "@whiskeysockets/baileys";
import * as QRCode from "qrcode";
import { Boom } from "@hapi/boom";
import pino from "pino";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Global Variables
let sock: ReturnType<typeof makeWASocket> | null = null;
let currentQR: string | null = null;
let isConnected = false;

// Initialize WhatsApp connection
async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState("baileys_auth_info");
  
  sock = makeWASocket({
    auth: state,
    printQRInTerminal: true, // You can also scan from terminal
    logger: pino({ level: "silent" }) as any,
    browser: Browsers.macOS("Desktop"),
    syncFullHistory: false,
  });

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      currentQR = await QRCode.toDataURL(qr);
      isConnected = false;
      console.log("QR Code received, scan it via /qr endpoint");
    }

    if (connection === "close") {
      isConnected = false;
      currentQR = null;
      const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log("Connection closed due to ", lastDisconnect?.error, ", reconnecting ", shouldReconnect);
      if (shouldReconnect) {
        connectToWhatsApp();
      }
    } else if (connection === "open") {
      isConnected = true;
      currentQR = null;
      console.log("Opened connection to WhatsApp");
    }
  });

  sock.ev.on("creds.update", saveCreds);
}

// Start connection
connectToWhatsApp();

// API Endpoints

app.get("/", (req, res) => {
  res.send("WhatsApp Service is Running. Status: " + (isConnected ? "Connected" : "Disconnected"));
});

// Endpoint to view QR code
app.get("/qr", (req, res) => {
  if (isConnected) {
    res.send("<h2>Already Connected to WhatsApp!</h2>");
    return;
  }
  if (!currentQR) {
    res.send("<h2>QR Code is generating... please refresh in a few seconds.</h2>");
    return;
  }
  res.send(`<img src="${currentQR}" alt="QR Code" style="width: 300px; height: 300px;"/><p>Scan with WhatsApp to link device</p>`);
});

// Endpoint to send a message
// Expected Body: { "number": "919876543210", "message": "Hello" }
app.post("/send", async (req, res) => {
  try {
    if (!isConnected || !sock) {
      return res.status(503).json({ success: false, error: "WhatsApp is not connected yet" });
    }

    const { number, message } = req.body;
    if (!number || !message) {
      return res.status(400).json({ success: false, error: "number and message are required" });
    }

    // Baileys needs number in format: 919876543210@s.whatsapp.net
    const jid = `${number}@s.whatsapp.net`;
    const result = await sock.onWhatsApp(jid);

    if (!result || result.length === 0 || !result[0]?.exists) {
      return res.status(404).json({ success: false, error: "Number not registered on WhatsApp" });
    }

    await sock.sendMessage(jid, { text: message });
    res.json({ success: true, message: "Message sent successfully!" });
  } catch (error: any) {
    console.error("Error sending message:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`WhatsApp API Server running on port ${PORT}`);
});
