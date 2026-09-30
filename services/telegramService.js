import "dotenv/config";

const TELEGRAM_API_URL = "https://api.telegram.org";
const TELEGRAM_TEST_CHAT_ID = "8457757691";

export function getTelegramConfiguration() {
    const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
    const defaultChatId = String(process.env.TELEGRAM_DEFAULT_CHAT_ID || "").trim();

    return {
        tokenConfigured: Boolean(token),
        defaultChatId: defaultChatId || null
    };
}

function escapeHtml(value) {
    return String(value ?? "No disponible")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function resolveChatId(chatIdTutor) {
    const chatId = chatIdTutor ?? process.env.TELEGRAM_DEFAULT_CHAT_ID;
    if (chatId === undefined || chatId === null || String(chatId).trim() === "") {
        throw new Error("No hay un chat_id de Telegram configurado para la notificación.");
    }

    return String(chatId).trim();
}

function normalizeCoordinate(value) {
    const coordinate = Number(value);
    return Number.isFinite(coordinate) ? coordinate : null;
}

export function locationLink(lat, lon) {
    const normalizedLat = normalizeCoordinate(lat);
    const normalizedLon = normalizeCoordinate(lon);
    if (normalizedLat === null || normalizedLon === null) return "No disponible";

    const coordinates = `${normalizedLat},${normalizedLon}`;
    const href = `https://www.google.com/maps?q=${coordinates}`;
    return `<a href="${escapeHtml(href)}">${escapeHtml(coordinates)}</a>`;
}

function formatLocation(location) {
    if (location === undefined || location === null || location === "") return "No disponible";
    if (typeof location === "string") return location;

    if (typeof location === "object") {
        const lat = location.lat ?? location.latitude;
        const lon = location.lon ?? location.lng ?? location.longitude;
        const normalizedLat = normalizeCoordinate(lat);
        const normalizedLon = normalizeCoordinate(lon);
        if (normalizedLat !== null && normalizedLon !== null) return `${normalizedLat},${normalizedLon}`;
    }

    return JSON.stringify(location);
}

function currentDateTime() {
    return new Intl.DateTimeFormat("es-MX", {
        dateStyle: "short",
        timeStyle: "medium",
        timeZone: "America/Mexico_City"
    }).format(new Date());
}

function createTelegramError(response, payload) {
    const statusCode = payload?.error_code || response.status;
    const description = payload?.description || `Respuesta HTTP ${response.status} sin descripción.`;
    const error = new Error(`Telegram API error ${statusCode}: ${description}`);
    error.statusCode = statusCode;
    error.telegramDescription = description;
    return error;
}

async function telegramRequest(method, body = {}) {
    const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
    if (!token) throw new Error("TELEGRAM_BOT_TOKEN no está configurado.");

    const endpoint = `${TELEGRAM_API_URL}/bot${encodeURIComponent(token)}/${method}`;

    try {
        const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });

        const rawBody = await response.text();
        let payload;
        try {
            payload = JSON.parse(rawBody);
        } catch {
            payload = { ok: false, description: rawBody || "Respuesta inválida de Telegram." };
        }

        if (!response.ok || payload.ok !== true) throw createTelegramError(response, payload);
        return payload;
    } catch (error) {
        console.error(`[Guardian Telegram] Error en ${method}:`, error.message);
        throw error;
    }
}

export async function sendTelegramMessage(text, chatIdTutor) {
    const chatId = resolveChatId(chatIdTutor);
    const payload = await telegramRequest("sendMessage", {
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: false
    });

    return {
        ok: true,
        chatId,
        messageId: payload.result?.message_id ?? null,
        telegram: payload
    };
}

export async function getTelegramUpdates({ offset, limit = 100 } = {}) {
    const body = {
        limit: Math.min(Math.max(Number(limit) || 100, 1), 100),
        timeout: 0
    };
    if (offset !== undefined && offset !== null && String(offset).trim() !== "") {
        body.offset = Number(offset);
    }

    const payload = await telegramRequest("getUpdates", body);
    return Array.isArray(payload.result) ? payload.result : [];
}

export async function notificarMensajePrueba(chatIdTutor = TELEGRAM_TEST_CHAT_ID) {
    const text = [
        "✅ <b>Guardian: prueba de Telegram exitosa</b>",
        "",
        "El canal de notificaciones está configurado correctamente.",
        `⏰ <b>Hora:</b> ${escapeHtml(currentDateTime())}`
    ].join("\n");

    return sendTelegramMessage(text, chatIdTutor);
}

export async function notificarAlertaPanico(datosAlerta = {}) {
    const text = [
        "🚨 <b>¡ALERTA DE PÁNICO ACTIVADA!</b> 🚨",
        "",
        `👤 <b>Usuario:</b> ${escapeHtml(datosAlerta.nombreUsuario)}`,
        `📞 <b>Teléfono:</b> ${escapeHtml(datosAlerta.telefonoUsuario)}`,
        `📍 <b>Ubicación actual:</b> ${locationLink(datosAlerta.lat, datosAlerta.lon)}`,
        `📹 <b>Poste C5 cercano:</b> ${escapeHtml(datosAlerta.c5PosteId ?? "No identificado")} a ${escapeHtml(datosAlerta.c5Distancia ?? "No disponible")}m`,
        `⏰ <b>Hora:</b> ${escapeHtml(currentDateTime())}`,
        "",
        "⚠️ <i>Por favor, ponte en contacto o verifica la situación de inmediato.</i>"
    ].join("\n");

    return sendTelegramMessage(text, datosAlerta.chatIdTutor);
}

export async function notificarDesvioRuta(datosDesvio = {}) {
    const text = [
        "⚠️ <b>ADVERTENCIA DE RECORRIDO - DESVÍO DETECTADO</b>",
        "",
        `👤 <b>Usuario:</b> ${escapeHtml(datosDesvio.nombreUsuario)}`,
        `🚩 <b>Destino original:</b> ${escapeHtml(datosDesvio.destino)}`,
        `🔢 <b>Reincidencia:</b> Desvío #${escapeHtml(datosDesvio.numeroDesvios ?? "No disponible")}`,
        `📍 <b>Ubicación del incidente:</b> ${locationLink(datosDesvio.lat, datosDesvio.lon)}`
    ].join("\n");

    return sendTelegramMessage(text, datosDesvio.chatIdTutor);
}

export async function notificarEstadoViaje(datosViaje = {}) {
    const estado = String(datosViaje.estado || "").toUpperCase();
    if (!["INICIADO", "FINALIZADO"].includes(estado)) {
        throw new Error("El estado del viaje debe ser INICIADO o FINALIZADO.");
    }

    const text = [
        `🚗 <b>MONITOREO DE VIAJE: ${escapeHtml(estado)}</b>`,
        "",
        `👤 <b>Usuario:</b> ${escapeHtml(datosViaje.nombreUsuario)}`,
        `📍 <b>Origen:</b> ${escapeHtml(formatLocation(datosViaje.origen))}`,
        `🏁 <b>Destino:</b> ${escapeHtml(datosViaje.destino)}`,
        `⏱️ <b>Tiempo estimado:</b> ${escapeHtml(datosViaje.etaMinutos ?? "No disponible")} minutos`
    ].join("\n");

    return sendTelegramMessage(text, datosViaje.chatIdTutor);
}

