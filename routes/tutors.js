import express from "express";

import { findTutorByUserId, saveTutor } from "../services/tutorStore.js";

const router = express.Router();

function validBody(body) {
    return body && typeof body === "object" && !Array.isArray(body);
}

function validateTutor(body, idUsuario) {
    if (!validBody(body)) return "El cuerpo debe ser un objeto JSON.";
    if (body.id_usuario && String(body.id_usuario) !== String(idUsuario)) return "id_usuario no coincide con la ruta.";
    if (!String(body.nombre || "").trim()) return "nombre es obligatorio.";
    if (!/^\d{10}$/.test(String(body.telefono || "").replace(/\D/g, ""))) return "telefono debe contener 10 dígitos.";
    return null;
}

router.get("/:idUsuario", async (req, res) => {
    try {
        const tutor = await findTutorByUserId(req.params.idUsuario);
        if (!tutor) return res.status(404).json({ ok: false, error: "Tutor no encontrado." });
        return res.json(tutor);
    } catch (error) {
        return res.status(500).json({ ok: false, error: error.message });
    }
});

router.put("/:idUsuario", async (req, res) => {
    const errorMessage = validateTutor(req.body, req.params.idUsuario);
    if (errorMessage) return res.status(400).json({ ok: false, error: errorMessage });

    try {
        const tutor = await saveTutor({
            ...req.body,
            id_usuario: String(req.params.idUsuario),
            telefono: String(req.body.telefono).replace(/\D/g, "")
        });
        return res.json(tutor);
    } catch (error) {
        return res.status(500).json({ ok: false, error: error.message });
    }
});

router.post("/", async (req, res) => {
    const idUsuario = req.body?.id_usuario;
    const errorMessage = validateTutor(req.body, idUsuario);
    if (errorMessage) return res.status(400).json({ ok: false, error: errorMessage });

    try {
        return res.status(201).json(await saveTutor({
            ...req.body,
            telefono: String(req.body.telefono).replace(/\D/g, "")
        }));
    } catch (error) {
        return res.status(500).json({ ok: false, error: error.message });
    }
});

export default router;

