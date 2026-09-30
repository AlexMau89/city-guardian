import redis
import json

# Conexión a Redis DB 5 en Docker
r = redis.Redis(host='localhost', port=6379, db=5, decode_responses=True)

camaras = []

# Obtenemos todas las claves de las cámaras
keys = r.keys("meta:camara:*")
if not keys:
    # Si las claves guardadas no llevan prefijo, las buscamos directamente
    keys = [f"meta:camara:{k}" for k in r.zrange("acompanamiento:cdmx:c5", 0, -1)]

for key in keys:
    data = r.hgetall(key)
    if data and "lat" in data and "lon" in data:
        camaras.append(data)

# Guardar en archivo JSON para la PWA
with open("camaras.json", "w", encoding="utf-8") as f:
    json.dump(camaras, f, ensure_ascii=False, indent=2)

print(f"✅ Se exportaron {len(camaras)} cámaras a camaras.json")