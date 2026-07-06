"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const baileys_1 = require("@whiskeysockets/baileys");
const QRCode = __importStar(require("qrcode"));
const pino_1 = __importDefault(require("pino"));
const app = (0, express_1.default)();
const PORT = process.env.PORT || 4000;
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Global Variables
let sock = null;
let currentQR = null;
let isConnected = false;
// Initialize WhatsApp connection
function connectToWhatsApp() {
    return __awaiter(this, void 0, void 0, function* () {
        const { state, saveCreds } = yield (0, baileys_1.useMultiFileAuthState)("baileys_auth_info");
        sock = (0, baileys_1.makeWASocket)({
            auth: state,
            printQRInTerminal: true, // You can also scan from terminal
            logger: (0, pino_1.default)({ level: "silent" }),
            browser: baileys_1.Browsers.macOS("Desktop"),
            syncFullHistory: false,
        });
        sock.ev.on("connection.update", (update) => __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            const { connection, lastDisconnect, qr } = update;
            if (qr) {
                currentQR = yield QRCode.toDataURL(qr);
                isConnected = false;
                console.log("QR Code received, scan it via /qr endpoint");
            }
            if (connection === "close") {
                isConnected = false;
                currentQR = null;
                const shouldReconnect = ((_b = (_a = lastDisconnect === null || lastDisconnect === void 0 ? void 0 : lastDisconnect.error) === null || _a === void 0 ? void 0 : _a.output) === null || _b === void 0 ? void 0 : _b.statusCode) !== baileys_1.DisconnectReason.loggedOut;
                console.log("Connection closed due to ", lastDisconnect === null || lastDisconnect === void 0 ? void 0 : lastDisconnect.error, ", reconnecting ", shouldReconnect);
                if (shouldReconnect) {
                    connectToWhatsApp();
                }
            }
            else if (connection === "open") {
                isConnected = true;
                currentQR = null;
                console.log("Opened connection to WhatsApp");
            }
        }));
        sock.ev.on("creds.update", saveCreds);
    });
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
app.post("/send", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
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
        const result = yield sock.onWhatsApp(jid);
        if (!result || result.length === 0 || !((_a = result[0]) === null || _a === void 0 ? void 0 : _a.exists)) {
            return res.status(404).json({ success: false, error: "Number not registered on WhatsApp" });
        }
        yield sock.sendMessage(jid, { text: message });
        res.json({ success: true, message: "Message sent successfully!" });
    }
    catch (error) {
        console.error("Error sending message:", error);
        res.status(500).json({ success: false, error: error.message });
    }
}));
app.listen(PORT, () => {
    console.log(`WhatsApp API Server running on port ${PORT}`);
});
