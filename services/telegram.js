const TELEGRAM_API_URL = "https://api.telegram.org";

function parseTelegramResponse(response, rawBody) {
    let payload;
    try {
        payload = JSON.parse(rawBody);
    } catch {
        payload = { ok: false, description: rawBody || "Respuesta inválida de Telegram." };
    }

    if (!response.ok || payload.ok !== true) {
        const code = payload.error_code || response.status;
        const detail = payload.description || `HTTP ${response.status}`;
        throw new Error(`Telegram ${code}: ${detail}`);
    }

    return payload.result;
}

export async function enviarTelegram(chatId, texto) {
    const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
    if (!token) throw new Error("TELEGRAM_BOT_TOKEN no está definido.");
    if (chatId === undefined || chatId === null || String(chatId).trim() === "") {
        throw new Error("No hay TELEGRAM_CHAT_ID ni telegram_chat_id de tutor configurado.");
    }

    const response = await fetch(`${TELEGRAM_API_URL}/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            chat_id: String(chatId),
            text: String(texto || "Guardian: notificación sin contenido.")
        })
    });

    return parseTelegramResponse(response, await response.text());
}

export async function obtenerUpdates(offset, timeout = 0) {
    const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
    if (!token) throw new Error("TELEGRAM_BOT_TOKEN no está definido.");

    const response = await fetch(`${TELEGRAM_API_URL}/bot${token}/getUpdates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offset, timeout, limit: 100 })
    });

    return parseTelegramResponse(response, await response.text()) || [];
}

