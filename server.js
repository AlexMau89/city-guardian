import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

import alertRoutes from "./routes/alerts.js";
import telemetryRoutes from "./routes/telemetry.js";
import tutorRoutes from "./routes/tutors.js";
import tripRoutes from "./routes/trips.js";
import userRoutes from "./routes/users.js";

const app = express();
const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const port = Number.parseInt(process.env.PORT || "3000", 10) || 3000;
const nodeEnvironment = process.env.NODE_ENV || "development";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const DEFAULT_CHAT = process.env.TELEGRAM_DEFAULT_CHAT_ID || process.env.TELEGRAM_CHAT_ID || "";

app.disable("x-powered-by");

// Middleware CORS
app.use((req, res, next) => {
    const origin = req.headers.origin;
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    return next();
});

app.use(express.json({ limit: "64kb" }));

// Endpoint directo de envío de alertas a Telegram (utilizado por el Frontend PWA)
app.post("/api/telegram/send-alert", async (req, res) => {
    if (!TOKEN) {
        return res.status(503).json({ ok: false, error: "TELEGRAM_BOT_TOKEN no configurado" });
    }

    const { title, message, chatId } = req.body;
    const targetChat = chatId || DEFAULT_CHAT;

    if (!targetChat) {
        return res.status(400).json({ ok: false, error: "Falta Chat ID de Telegram" });
    }

    try {
        const response = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chat_id: targetChat,
                text: `🚨 <b>${title || 'ALERTA GUARDIAN'}</b>\n${message || ''}`,
                parse_mode: "HTML"
            })
        });

        const data = await response.json();
        if (!response.ok || !data.ok) {
            return res.status(502).json({ ok: false, error: data.description || "Error de Telegram" });
        }

        return res.json({ ok: true, sent: true, messageId: data.result.message_id });
    } catch (err) {
        return res.status(502).json({ ok: false, error: "No se pudo contactar a Telegram" });
    }
});

// Rutas modulares de Express
app.get("/health", (_req, res) => {
    res.json({
        ok: true,
        service: "guardian-notifications-api",
        environment: nodeEnvironment,
        telegramConfigured: Boolean(TOKEN)
    });
});

app.use("/api", alertRoutes);
app.use("/api/tutores", tutorRoutes);
app.use("/api/usuarios", userRoutes);
app.use("/api/historial-ubicaciones", telemetryRoutes);
app.use("/api/viajes", tripRoutes);

app.use(express.static(projectRoot, { dotfiles: "ignore" }));

export function startServer() {
    return app.listen(port, () => {
        console.log(`Guardian API ejecutándose en http://localhost:${port} (${nodeEnvironment})`);
    });
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
    startServer();
}

export default app;