import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDirectory = path.join(projectRoot, "data");

async function ensureDataDirectory() {
    await mkdir(dataDirectory, { recursive: true });
}

export async function readData(fileName, fallback = []) {
    await ensureDataDirectory();
    const filePath = path.join(dataDirectory, fileName);

    try {
        const content = await readFile(filePath, "utf8");
        const value = JSON.parse(content);
        return value ?? fallback;
    } catch (error) {
        if (error.code !== "ENOENT") {
            console.warn(`[Guardian] No se pudo leer data/${fileName}:`, error.message);
        }
        return fallback;
    }
}

export async function writeData(fileName, value) {
    await ensureDataDirectory();
    const filePath = path.join(dataDirectory, fileName);
    await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    return value;
}

export async function appendData(fileName, value, limit = 2000) {
    const records = await readData(fileName, []);
    const next = [value, ...(Array.isArray(records) ? records : [])].slice(0, limit);
    return writeData(fileName, next);
}

