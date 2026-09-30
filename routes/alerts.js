import express from "express";
import { randomUUID } from "node:crypto";

import { appendData } from "../services/dataStore.js";
import { notifySafely } from "../services/notification.js";
import { enviarTelegram, obtenerUpdates } from "../services/telegram.js";

const router = express.Router();

function validBody(body) {
    return body && typeof body === "object" && !Array.isArray(body);
}

function value(valueToRead, fallback = "No disponible") {
    return valueToRead === undefined || valueToRead === null || valueToRead === "" ? fallback : valueToRead;
}

function mapUrl(lat, lon) {
    const normalizedLat = Number(lat);
    const normalizedLon = Number(lon);
    return Number.isFinite(normalizedLat) && Number.isFinite(normalizedLon)
        ? `https://maps.google.com/?q=${normalizedLat},${normalizedLon}`
        : "Ubicación no disponible";
}

async function storeAlert(data) {
    const alert = {
        id_alerta: data.id_alerta || randomUUID(),
        id_viaje: data.id_viaje || data.idViaje || null,
        tipo_alerta: data.tipo_alerta,
        nivel_gravedad: data.nivel_gravedad || "ALTA",
        lat_incidente: data.lat ?? data.lat_incidente ?? null,
        lon_incidente: data.lon ?? data.lon_incidente ?? null,
        c5_poste_cercano_id: data.c5PosteId ?? data.c5_poste_cercano_id ?? null,
        c5_distancia_metros: data.c5Distancia ?? data.c5_distancia_metros ?? null,
        telemetria_snapshot: data.telemetriaSnapshot ?? data.telemetria_snapshot ?? null,
        estado_resolucion: "NO_ATENDIDA",
        creado_en: new Date().toISOString()
    };
    await appendData("alertas.json", alert);
    return alert;
}

router.get("/telegram/test", async (_req, res) => {
    try {
        await enviarTelegram(process.env.TELEGRAM_CHAT_ID, "Guardian: mensaje de prueba Telegram.");
        return res.json({ ok: true, telegram: true });
    } catch (error) {
        console.error("[Guardian Telegram] Prueba fallida:", error.message);
        return res.status(502).json({ ok: false, telegram: false, error: error.message });
    }
});

router.get("/telegram/get-updates", async (req, res) => {
    try {
        const offset = req.query.offset ? Number(req.query.offset) : undefined;
        const updates = await obtenerUpdates(offset, 0);
        const chats = updates
            .filter(update => /^\/start(?:@[^\s]+)?(?:\s|$)/i.test(String(update.message?.text || "").trim()))
            .map(update => ({
                update_id: update.update_id,
                chat_id: update.message.chat.id,
                text: update.message.text
            }));
        console.table(chats);
        return res.json({ ok: true, updates, chats });
    } catch (error) {
        console.error("[Guardian Telegram] getUpdates falló:", error.message);
        return res.status(502).json({ ok: false, telegram: false, error: error.message });
    }
});

router.get("/telegram/enlace/:idUsuario", (req, res) => {
    const username = String(process.env.TELEGRAM_BOT_USERNAME || "").replace(/^@/, "").trim();
    if (!username) {
        return res.status(503).json({ ok: false, error: "TELEGRAM_BOT_USERNAME no está configurado." });
    }

    return res.json({
        url: `https://t.me/${username}?start=${encodeURIComponent(req.params.idUsuario)}`
    });
});

router.post("/alertas/desvio", async (req, res) => {
    if (!validBody(req.body)) return res.status(400).json({ ok: false, error: "El cuerpo debe ser un objeto JSON." });

    const data = req.body;
    const nombreUsuario = value(data.nombreUsuario, "Usuario Guardian");
    const numeroDesvios = value(data.numeroDesvios, 0);
    const destino = value(data.destino, "Destino no disponible");
    const text = `⚠️ ${nombreUsuario} se desvió ${numeroDesvios} veces de su ruta hacia ${destino}. Ubicación: ${mapUrl(data.lat, data.lon)}`;

    try {
        const alerta = await storeAlert({ ...data, tipo_alerta: "DESVIO_REITERADO" });
        const notification = await notifySafely({
            idUsuario: data.idUsuario || data.id_usuario,
            idViaje: data.idViaje || data.id_viaje,
            text
        });
        return res.json({ ok: true, ...notification, alerta });
    } catch (error) {
        console.error("[Guardian] No se pudo registrar el desvío:", error.message);
        return res.status(500).json({ ok: false, error: error.message });
    }
});

router.post("/alertas/panico", async (req, res) => {
    if (!validBody(req.body)) return res.status(400).json({ ok: false, error: "El cuerpo debe ser un objeto JSON." });

    const data = req.body;
    const nombreUsuario = value(data.nombreUsuario, "Usuario Guardian");
    const idViaje = value(data.idViaje || data.id_viaje, "No disponible");
    const text = `🚨 ALERTA DE PÁNICO Guardian\nUsuario: ${nombreUsuario}\nViaje: ${idViaje}\nUbicación: ${mapUrl(data.lat, data.lon)}`;

    try {
        const alerta = await storeAlert({ ...data, tipo_alerta: "BOTON_PANICO" });
        const notification = await notifySafely({
            idUsuario: data.idUsuario || data.id_usuario,
            idViaje: data.idViaje || data.id_viaje,
            text
        });
        return res.json({ ok: true, ...notification, alerta });
    } catch (error) {
        console.error("[Guardian] No se pudo registrar el pánico:", error.message);
        return res.status(500).json({ ok: false, error: error.message });
    }
});

export default router;

