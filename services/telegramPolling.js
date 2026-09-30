import { obtenerUpdates, enviarTelegram } from "./telegram.js";
import { setTutorTelegramChatId } from "./tutorStore.js";

let pollingStarted = false;

function sleep(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function parseStartCommand(text) {
    const match = String(text || "").trim().match(/^\/start(?:@[^\s]+)?(?:\s+([^\s]+))?$/i);
    return match?.[1] || null;
}

async function processUpdate(update) {
    const message = update.message;
    const idUsuario = parseStartCommand(message?.text);
    if (!idUsuario || !message?.chat?.id) return;

    const tutor = await setTutorTelegramChatId(idUsuario, message.chat.id);
    if (!tutor) {
        await enviarTelegram(message.chat.id, "No encontramos un tutor pendiente para este enlace.");
        return;
    }

    await enviarTelegram(message.chat.id, "Vinculado correctamente");
    console.log(`[Guardian Telegram] Tutor vinculado: usuario=${idUsuario}, chat_id=${message.chat.id}`);
}

async function pollTelegram() {
    let offset = Number(process.env.TELEGRAM_UPDATE_OFFSET || 0) || 0;

    while (pollingStarted) {
        try {
            const updates = await obtenerUpdates(offset, 25);
            for (const update of updates) {
                offset = Math.max(offset, Number(update.update_id || 0) + 1);
                try {
                    await processUpdate(update);
                } catch (error) {
                    console.error("[Guardian Telegram] No se pudo procesar una vinculación:", error.message);
                }
            }
        } catch (error) {
            console.error("[Guardian Telegram] Polling detenido temporalmente:", error.message);
            await sleep(5000);
        }
    }
}

export function startTelegramPolling() {
    if (pollingStarted) return;
    if (!String(process.env.TELEGRAM_BOT_TOKEN || "").trim()) {
        console.warn("[Guardian Telegram] TELEGRAM_BOT_TOKEN no está definido; polling desactivado.");
        return;
    }

    pollingStarted = true;
    void pollTelegram();
    console.log("[Guardian Telegram] Polling de vinculaciones iniciado.");
}

