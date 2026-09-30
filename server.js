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

app.disable("x-powered-by");
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

