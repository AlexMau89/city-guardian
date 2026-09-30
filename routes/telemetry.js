import express from "express";

import { appendData } from "../services/dataStore.js";

const router = express.Router();

router.post("/", async (req, res) => {
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
        return res.status(400).json({ ok: false, error: "El punto de ubicación debe ser un objeto JSON." });
    }

    try {
        await appendData("historial_ubicaciones.json", req.body);
        return res.status(201).json({ ok: true, punto: req.body });
    } catch (error) {
        return res.status(500).json({ ok: false, error: error.message });
    }
});

export default router;

