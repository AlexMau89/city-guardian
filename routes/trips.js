import express from "express";
import { randomUUID } from "node:crypto";

import { readData, writeData } from "../services/dataStore.js";
import { notifySafely } from "../services/notification.js";

const router = express.Router();

function validBody(body) {
    return body && typeof body === "object" && !Array.isArray(body);
}

async function saveTrip(data) {
    const trips = await readData("viajes.json", []);
    const id = String(data.id_viaje || data.idViaje || randomUUID());
    const index = trips.findIndex(trip => String(trip.id_viaje || "") === id);
    const previous = index >= 0 ? trips[index] : {};
    const trip = { ...previous, ...data, id_viaje: id, actualizado_en: new Date().toISOString() };
    if (index >= 0) trips[index] = trip;
    else trips.push(trip);
    await writeData("viajes.json", trips);
    return trip;
}

function tripMessage(data) {
    const estado = String(data.estado || "ACTUALIZADO").toUpperCase();
    return `🚗 Guardian: viaje ${estado}\nUsuario: ${data.nombreUsuario || "No disponible"}\nDestino: ${data.destino || "No disponible"}\nETA: ${data.etaMinutos ?? "No disponible"} minutos`;
}

router.post("/notificar", async (req, res) => {
    if (!validBody(req.body)) return res.status(400).json({ ok: false, error: "El cuerpo debe ser un objeto JSON." });

    try {
        const trip = await saveTrip(req.body);
        const notification = await notifySafely({
            idUsuario: req.body.idUsuario || req.body.id_usuario,
            idViaje: trip.id_viaje,
            text: tripMessage(req.body)
        });
        return res.json({ ok: true, ...notification, viaje: trip });
    } catch (error) {
        console.error("[Guardian] No se pudo procesar el viaje:", error.message);
        return res.status(500).json({ ok: false, error: error.message });
    }
});

router.put("/:idViaje", async (req, res) => {
    if (!validBody(req.body)) return res.status(400).json({ ok: false, error: "El cuerpo debe ser un objeto JSON." });
    try {
        return res.json({ ok: true, viaje: await saveTrip({ ...req.body, id_viaje: req.params.idViaje }) });
    } catch (error) {
        return res.status(500).json({ ok: false, error: error.message });
    }
});

export default router;

