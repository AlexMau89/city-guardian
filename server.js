import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

import alertRoutes from "./routes/alerts.js";

const app = express();
const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const port = Number.parseInt(process.env.PORT || "3000", 10) || 3000;
const nodeEnvironment = process.env.NODE_ENV || "development";
const mockTwilio = /^(true|1|yes)$/i.test(process.env.MOCK_TWILIO || "false");
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
        mockTwilio
    });
});

app.use("/api", alertRoutes);
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
        console.log(`MOCK_TWILIO=${mockTwilio}`);
    });
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
    startServer();
}

export default app;

