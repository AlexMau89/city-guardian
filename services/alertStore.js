import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const servicesDirectory = path.dirname(fileURLToPath(import.meta.url));
const storageDirectory = path.resolve(servicesDirectory, "..", "data");
const storageFile = path.join(storageDirectory, "guardian_alertas.json");

let records = [];
let initialized = false;
let initializationPromise;
let writeQueue = Promise.resolve();

async function ensureLoaded() {
    if (initialized) return;
    if (!initializationPromise) {
        initializationPromise = (async () => {
            try {
                const content = await readFile(storageFile, "utf8");
                const parsed = JSON.parse(content);
                records = Array.isArray(parsed) ? parsed : [];
            } catch (error) {
                if (error.code !== "ENOENT") {
                    console.warn("[Guardian] No se pudo leer el historial local de alertas:", error.message);
                }
                records = [];
            }
            initialized = true;
        })();
    }

    await initializationPromise;
}

function persistRecords() {
    const snapshot = JSON.stringify(records, null, 2);
    writeQueue = writeQueue
        .catch(() => undefined)
        .then(async () => {
            await mkdir(storageDirectory, { recursive: true });
            await writeFile(storageFile, `${snapshot}\n`, "utf8");
        });

    return writeQueue;
}

export async function guardarAlerta(alerta) {
    await ensureLoaded();
    records.unshift(alerta);
    await persistRecords();
    return alerta;
}

