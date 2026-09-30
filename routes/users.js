import express from "express";
import { randomUUID } from "node:crypto";

import { readData, writeData } from "../services/dataStore.js";

const router = express.Router();

function validBody(body) {
    return body && typeof body === "object" && !Array.isArray(body);
}

async function saveUser(data, idUsuario = data.id_usuario) {
    const users = await readData("usuarios.json", []);
    const id = String(idUsuario || randomUUID());
    const index = users.findIndex(user => String(user.id_usuario || "") === id);
    const previous = index >= 0 ? users[index] : {};
    const user = { ...previous, ...data, id_usuario: id, creado_en: previous.creado_en || data.creado_en || new Date().toISOString() };
    if (index >= 0) users[index] = user;
    else users.push(user);
    await writeData("usuarios.json", users);
    return user;
}

router.post("/", async (req, res) => {
    if (!validBody(req.body) || !String(req.body.email || "").trim()) {
        return res.status(400).json({ ok: false, error: "email y un objeto JSON son obligatorios." });
    }
    try {
        return res.status(201).json(await saveUser(req.body));
    } catch (error) {
        return res.status(500).json({ ok: false, error: error.message });
    }
});

router.put("/:idUsuario", async (req, res) => {
    if (!validBody(req.body)) return res.status(400).json({ ok: false, error: "El cuerpo debe ser un objeto JSON." });
    try {
        return res.json(await saveUser(req.body, req.params.idUsuario));
    } catch (error) {
        return res.status(500).json({ ok: false, error: error.message });
    }
});

export default router;

