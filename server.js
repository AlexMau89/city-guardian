import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

import alertRoutes from "./routes/alerts.js";
import telemetryRoutes from "./routes/telemetry.js";
import tutorRoutes from "./routes/tutors.js";
import tripRoutes from "./routes/trips.js";
import userRoutes from "./routes/users.js";
import { startTelegramPolling } from "./services/telegramPolling.js";

const app = express();
const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const port = Number.parseInt(process.env.PORT || "3000", 10) || 3000;
const nodeEnvironment = process.env.NODE_ENV || "development";
const configuredCorsOrigins = new Set(
    String(process.env.CORS_ORIGINS || "")
        .split(",")
        .map(origin => origin.trim())
        .filter(Boolean)
);

function isAllowedCorsOrigin(origin) {
    if (!origin) return true;
    if (configuredCorsOrigins.has(origin)) return true;

    try {
        const url = new URL(origin);
        if (url.protocol !== "http:") return false;

        const hostname = url.hostname.replace(/^\[|\]$/g, "");
        return hostname === "localhost"
            || hostname === "127.0.0.1"
            || hostname === "::1"
            || /^10\./.test(hostname)
            || /^192\.168\./.test(hostname)
            || /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);
    } catch {
        return false;
    }
}

app.disable("x-powered-by");
app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && !isAllowedCorsOrigin(origin)) {
        return res.status(403).json({ ok: false, error: "Origen no permitido por la política CORS." });
    }

    res.setHeader("Access-Control-Allow-Origin", origin || "*");
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    return next();
});
app.use(express.json({ limit: "64kb" }));

app.get("/health", (_req, res) => {
    res.json({
        ok: true,
        service: "guardian-notifications-api",
        environment: nodeEnvironment,
        telegramConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN)
    });
});

app.use("/api", alertRoutes);
app.use("/api/tutores", tutorRoutes);
app.use("/api/usuarios", userRoutes);
app.use("/api/historial-ubicaciones", telemetryRoutes);
app.use("/api/viajes", tripRoutes);
app.use(express.static(projectRoot, { dotfiles: "ignore" }));
app.use((error, _req, res, next) => {
    if (error instanceof SyntaxError && error.status === 400 && error.type === "entity.parse.failed") {
        return res.status(400).json({
            ok: false,
            error: "El cuerpo de la petición contiene JSON inválido."
        });
    }

    return next(error);
});

export function startServer() {
    return app.listen(port, () => {
        console.log(`Guardian API ejecutándose en http://localhost:${port} (${nodeEnvironment})`);
        startTelegramPolling();
    });
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
    startServer();
}

export default app;

