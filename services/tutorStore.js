import { randomUUID } from "node:crypto";

import { readData, writeData } from "./dataStore.js";

const TUTORS_FILE = "tutores.json";

export async function listTutors() {
    const tutors = await readData(TUTORS_FILE, []);
    return Array.isArray(tutors) ? tutors : [];
}

export async function findTutorByUserId(idUsuario) {
    const normalizedId = String(idUsuario || "");
    return (await listTutors()).find(tutor => String(tutor.id_usuario || "") === normalizedId) || null;
}

export async function saveTutor(data = {}) {
    const idUsuario = String(data.id_usuario || "").trim();
    if (!idUsuario) throw new Error("id_usuario es obligatorio.");

    const tutors = await listTutors();
    const index = tutors.findIndex(tutor => String(tutor.id_usuario || "") === idUsuario);
    const previous = index >= 0 ? tutors[index] : {};
    const tutor = {
        ...previous,
        ...data,
        id_tutor: previous.id_tutor || data.id_tutor || randomUUID(),
        id_usuario: idUsuario,
        telegram_chat_id: data.telegram_chat_id ?? previous.telegram_chat_id ?? null,
        creado_en: previous.creado_en || data.creado_en || new Date().toISOString()
    };

    if (index >= 0) tutors[index] = tutor;
    else tutors.push(tutor);
    await writeData(TUTORS_FILE, tutors);
    return tutor;
}

export async function setTutorTelegramChatId(idUsuario, chatId) {
    const tutor = await findTutorByUserId(idUsuario);
    if (!tutor) return null;
    return saveTutor({ ...tutor, telegram_chat_id: String(chatId) });
}

