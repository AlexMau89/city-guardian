import express from "express";
import { randomUUID } from "node:crypto";

import {
    notificarAlertaPanico,
    notificarDesvioRuta,
    notificarEstadoViaje
} from "../services/telegramService.js";
import { guardarAlerta } from "../services/alertStore.js";

const router = express.Router();

function requestData(req) {
    return req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
}

function buildPanicAlert(data) {
    return {
        id_alerta: data.id_alerta || randomUUID(),
        id_viaje: data.id_viaje || data.idViaje || null,
        tipo_alerta: "BOTON_PANICO",
        nivel_gravedad: "ALTA",
        lat_incidente: data.lat ?? data.lat_incidente ?? null,
        lon_incidente: data.lon ?? data.lon_incidente ?? null,
        c5_poste_cercano_id: data.c5PosteId ?? data.c5_poste_cercano_id ?? null,
        c5_distancia_metros: data.c5Distancia ?? data.c5_distancia_metros ?? null,
        telemetria_snapshot: data.telemetriaSnapshot ?? data.telemetria_snapshot ?? null,
        estado_resolucion: "NO_ATENDIDA",
        creado_en: new Date().toISOString()
    };
}

function notificationSummary(result) {
    return {
        chatId: result.chatId,
        messageId: result.messageId
    };
}

router.post("/alertas/panico", async (req, res) => {
    const data = requestData(req);
    const alerta = buildPanicAlert(data);

    try {
        await guardarAlerta(alerta);
    } catch (error) {
        console.error("[Guardian] No se pudo guardar la alerta de pánico:", error.message);
        return res.status(500).json({
            ok: false,
            error: "No se pudo guardar la alerta de pánico.",
            alerta
        });
    }

    try {
        const telegram = await notificarAlertaPanico({
            ...data,
            lat: alerta.lat_incidente,
            lon: alerta.lon_incidente,
            c5PosteId: alerta.c5_poste_cercano_id,
            c5Distancia: alerta.c5_distancia_metros
        });

        return res.status(201).json({
            ok: true,
            alerta,
            telegram: notificationSummary(telegram)
        });
    } catch (error) {
        return res.status(502).json({
            ok: false,
            error: "La alerta fue guardada, pero Telegram no pudo enviar la notificación.",
            alerta,
            detail: error.message
        });
    }
});

router.post("/alertas/desvio", async (req, res) => {
    try {
        const telegram = await notificarDesvioRuta(requestData(req));
        return res.json({ ok: true, telegram: notificationSummary(telegram) });
    } catch (error) {
        return res.status(502).json({
            ok: false,
            error: "No se pudo enviar la notificación de desvío.",
            detail: error.message
        });
    }
});

router.post("/viajes/notificar", async (req, res) => {
    try {
        const telegram = await notificarEstadoViaje(requestData(req));
        return res.json({ ok: true, telegram: notificationSummary(telegram) });
    } catch (error) {
        return res.status(502).json({
            ok: false,
            error: "No se pudo enviar la notificación del estado del viaje.",
            detail: error.message
        });
    }
});

export default router;

