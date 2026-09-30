import { readData } from "./dataStore.js";
import { enviarTelegram } from "./telegram.js";
import { findTutorByUserId } from "./tutorStore.js";

export async function resolveNotificationTarget({ idUsuario, idViaje } = {}) {
    let tutor = null;
    let usuarioId = idUsuario || null;

    if (!usuarioId && idViaje) {
        const trips = await readData("viajes.json", []);
        const trip = Array.isArray(trips)
            ? trips.find(item => String(item.id_viaje || item.idViaje || "") === String(idViaje))
            : null;
        usuarioId = trip?.id_usuario || trip?.idUsuario || null;
    }

    if (usuarioId) tutor = await findTutorByUserId(usuarioId);

    return {
        tutor,
        chatId: tutor?.telegram_chat_id || process.env.TELEGRAM_CHAT_ID || null
    };
}

export async function notifySafely({ idUsuario, idViaje, text }) {
    const target = await resolveNotificationTarget({ idUsuario, idViaje });

    try {
        await enviarTelegram(target.chatId, text);
        return { telegram: true };
    } catch (error) {
        console.error("[Guardian Telegram] No se pudo entregar la alerta:", error.message);
        return { telegram: false };
    }
}

