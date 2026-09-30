import express from "express";
import { randomUUID } from "node:crypto";

import {
    getTelegramConfiguration,
    getTelegramUpdates,
    notificarAlertaPanico,
    notificarDesvioRuta,
    notificarEstadoViaje,
    notificarMensajePrueba
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

function getStartChats(updates) {
    const chats = new Map();

    for (const update of updates) {
        const message = update.message || update.edited_message || update.channel_post;
        const text = String(message?.text || "").trim();
        if (!/^\/start(?:@[^\s]+)?(?:\s|$)/i.test(text)) continue;

        const chat = message?.chat;
        if (!chat?.id) continue;

        chats.set(String(chat.id), {
            update_id: update.update_id,
            chat_id: chat.id,
            tipo_chat: chat.type || "desconocido",
            username: message.from?.username || null,
            nombre: message.from?.first_name || null,
            apellido: message.from?.last_name || null,
            comando: text
        });
    }

    return [...chats.values()];
}

router.get("/telegram/test", async (req, res) => {
    const chatId = String(
        req.query.chatId || process.env.TELEGRAM_DEFAULT_CHAT_ID || "8457757691"
    ).trim();

    try {
        const telegram = await notificarMensajePrueba(chatId);
        console.info(`[Guardian Telegram] Prueba enviada correctamente a chat_id=${telegram.chatId}.`);
        return res.status(200).json({
            ok: true,
            message: "Mensaje de prueba enviado correctamente a Telegram.",
            telegram: notificationSummary(telegram),
            configuration: getTelegramConfiguration()
        });
    } catch (error) {
        return res.status(502).json({
            ok: false,
            error: "No se pudo enviar el mensaje de prueba a Telegram.",
            detail: error.message,
            configuration: getTelegramConfiguration()
        });
    }
});

router.get("/telegram/get-updates", async (req, res) => {
    try {
        const updates = await getTelegramUpdates({
            offset: req.query.offset,
            limit: req.query.limit
        });
        const chats = getStartChats(updates);

        console.info("[Guardian Telegram] Chat IDs obtenidos mediante /start:");
        if (chats.length) {
            console.table(chats);
        } else {
            console.info("No se encontraron mensajes /start pendientes.");
        }
        console.info(
            "Referencia solicitada: +52 777 259 6608. Telegram no incluye el teléfono en getUpdates; esa persona debe enviar /start para identificar su chat_id."
        );

        return res.status(200).json({
            ok: true,
            totalUpdates: updates.length,
            chats,
            note: "Telegram no expone números telefónicos en getUpdates. Solicita /start al contacto de referencia y compara su chat_id."
        });
    } catch (error) {
        return res.status(502).json({
            ok: false,
            error: "No se pudieron consultar las actualizaciones de Telegram.",
            detail: error.message,
            configuration: getTelegramConfiguration()
        });
    }
});

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

