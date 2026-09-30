import requests
import json
import redis

# Conexión a Redis (Base de datos 5)
r = redis.Redis(host='localhost', port=6379, db=5, decode_responses=True)
REDIS_GEO_KEY = "acompanamiento:cdmx:c5"

# URLs manuales proporcionadas
URLS_MANUALES = [
    "https://geoportal.mapoteca.com.mx/proxy/wms/1?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo&FORMAT=image%2Fpng&TRANSPARENT=true&QUERY_LAYERS=c5_camaras_videovigilancia&TILED=true&TILESORIGIN=-180%2C-90&LAYERS=c5_camaras_videovigilancia&INFO_FORMAT=application%2Fjson&feature_count=100&I=230&J=203&WIDTH=256&HEIGHT=256&CRS=EPSG%3A3857&BBOX=-11036283.891926888%2C2211170.354233578%2C-11031391.922116637%2C2216062.324043829",
    "https://geoportal.mapoteca.com.mx/proxy/wms/1?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo&FORMAT=image%2Fpng&TRANSPARENT=true&QUERY_LAYERS=c5_camaras_videovigilancia&TILED=true&TILESORIGIN=-180%2C-90&LAYERS=c5_camaras_videovigilancia&INFO_FORMAT=application%2Fjson&feature_count=100&I=237&J=72&WIDTH=256&HEIGHT=256&CRS=EPSG%3A3857&BBOX=-11046067.83154739%2C2211170.354233578%2C-11036283.891926888%2C2220954.2938540806",
    "https://geoportal.mapoteca.com.mx/proxy/wms/1?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo&FORMAT=image%2Fpng&TRANSPARENT=true&QUERY_LAYERS=c5_camaras_videovigilancia&TILED=true&TILESORIGIN=-180%2C-90&LAYERS=c5_camaras_videovigilancia&INFO_FORMAT=application%2Fjson&feature_count=100&I=59&J=183&WIDTH=256&HEIGHT=256&CRS=EPSG%3A3857&BBOX=-11036283.891926888%2C2211170.354233578%2C-11026499.952306386%2C2220954.2938540806",
    "https://geoportal.mapoteca.com.mx/proxy/wms/1?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo&FORMAT=image%2Fpng&TRANSPARENT=true&QUERY_LAYERS=c5_camaras_videovigilancia&TILED=true&TILESORIGIN=-180%2C-90&LAYERS=c5_camaras_videovigilancia&INFO_FORMAT=application%2Fjson&feature_count=100&I=253&J=217&WIDTH=256&HEIGHT=256&CRS=EPSG%3A3857&BBOX=-11046067.83154739%2C2211170.354233578%2C-11036283.891926888%2C2220954.2938540806",
    "https://geoportal.mapoteca.com.mx/proxy/wms/1?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo&FORMAT=image%2Fpng&TRANSPARENT=true&QUERY_LAYERS=c5_camaras_videovigilancia&TILED=true&TILESORIGIN=-180%2C-90&LAYERS=c5_camaras_videovigilancia&INFO_FORMAT=application%2Fjson&feature_count=100&I=24&J=122&WIDTH=256&HEIGHT=256&CRS=EPSG%3A3857&BBOX=-11036283.891926888%2C2211170.354233578%2C-11026499.952306386%2C2220954.2938540806",
    "https://geoportal.mapoteca.com.mx/proxy/wms/1?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo&FORMAT=image%2Fpng&TRANSPARENT=true&QUERY_LAYERS=c5_camaras_videovigilancia&TILED=true&TILESORIGIN=-180%2C-90&LAYERS=c5_camaras_videovigilancia&INFO_FORMAT=application%2Fjson&feature_count=100&I=185&J=237&WIDTH=256&HEIGHT=256&CRS=EPSG%3A3857&BBOX=-11036283.891926888%2C2211170.354233578%2C-11026499.952306386%2C2220954.2938540806",
    "https://geoportal.mapoteca.com.mx/proxy/wms/1?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo&FORMAT=image%2Fpng&TRANSPARENT=true&QUERY_LAYERS=c5_camaras_videovigilancia&TILED=true&TILESORIGIN=-180%2C-90&LAYERS=c5_camaras_videovigilancia&INFO_FORMAT=application%2Fjson&feature_count=100&I=166&J=186&WIDTH=256&HEIGHT=256&CRS=EPSG%3A3857&BBOX=-11036283.891926888%2C2211170.354233578%2C-11026499.952306386%2C2220954.2938540806",
    "https://geoportal.mapoteca.com.mx/proxy/wms/1?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo&FORMAT=image%2Fpng&TRANSPARENT=true&QUERY_LAYERS=c5_camaras_videovigilancia&TILED=true&TILESORIGIN=-180%2C-90&LAYERS=c5_camaras_videovigilancia&INFO_FORMAT=application%2Fjson&feature_count=100&I=234&J=192&WIDTH=256&HEIGHT=256&CRS=EPSG%3A3857&BBOX=-11046067.83154739%2C2211170.354233578%2C-11036283.891926888%2C2220954.2938540806",
    "https://geoportal.mapoteca.com.mx/proxy/wms/1?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo&FORMAT=image%2Fpng&TRANSPARENT=true&QUERY_LAYERS=c5_camaras_videovigilancia&TILED=true&TILESORIGIN=-180%2C-90&LAYERS=c5_camaras_videovigilancia&INFO_FORMAT=application%2Fjson&feature_count=100&I=226&J=94&WIDTH=256&HEIGHT=256&CRS=EPSG%3A3857&BBOX=-11046067.83154739%2C2211170.354233578%2C-11036283.891926888%2C2220954.2938540806",
    "https://geoportal.mapoteca.com.mx/proxy/wms/1?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo&FORMAT=image%2Fpng&TRANSPARENT=true&QUERY_LAYERS=c5_camaras_videovigilancia&TILED=true&TILESORIGIN=-180%2C-90&LAYERS=c5_camaras_videovigilancia&INFO_FORMAT=application%2Fjson&feature_count=100&I=231&J=65&WIDTH=256&HEIGHT=256&CRS=EPSG%3A3857&BBOX=-11046067.83154739%2C2211170.354233578%2C-11036283.891926888%2C2220954.2938540806",
    "https://geoportal.mapoteca.com.mx/proxy/wms/1?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo&FORMAT=image%2Fpng&TRANSPARENT=true&QUERY_LAYERS=c5_camaras_videovigilancia&TILED=true&TILESORIGIN=-180%2C-90&LAYERS=c5_camaras_videovigilancia&INFO_FORMAT=application%2Fjson&feature_count=100&I=34&J=125&WIDTH=256&HEIGHT=256&CRS=EPSG%3A3857&BBOX=-11036283.891926888%2C2211170.354233578%2C-11026499.952306386%2C2220954.2938540806",
    "https://geoportal.mapoteca.com.mx/proxy/wms/1?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo&FORMAT=image%2Fpng&TRANSPARENT=true&QUERY_LAYERS=c5_camaras_videovigilancia&TILED=true&TILESORIGIN=-180%2C-90&LAYERS=c5_camaras_videovigilancia&INFO_FORMAT=application%2Fjson&feature_count=100&I=133&J=41&WIDTH=256&HEIGHT=256&CRS=EPSG%3A3857&BBOX=-11036283.891926888%2C2201386.4146130756%2C-11026499.952306386%2C2211170.3542335783",
    "https://geoportal.mapoteca.com.mx/proxy/wms/1?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo&FORMAT=image%2Fpng&TRANSPARENT=true&QUERY_LAYERS=c5_camaras_videovigilancia&TILED=true&TILESORIGIN=-180%2C-90&LAYERS=c5_camaras_videovigilancia&INFO_FORMAT=application%2Fjson&feature_count=100&I=182&J=67&WIDTH=256&HEIGHT=256&CRS=EPSG%3A3857&BBOX=-11036283.891926888%2C2201386.4146130756%2C-11026499.952306386%2C2211170.3542335783",
    "https://geoportal.mapoteca.com.mx/proxy/wms/1?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo&FORMAT=image%2Fpng&TRANSPARENT=true&QUERY_LAYERS=c5_camaras_videovigilancia&TILED=true&TILESORIGIN=-180%2C-90&LAYERS=c5_camaras_videovigilancia&INFO_FORMAT=application%2Fjson&feature_count=100&I=182&J=76&WIDTH=256&HEIGHT=256&CRS=EPSG%3A3857&BBOX=-11036283.891926888%2C2201386.4146130756%2C-11026499.952306386%2C2211170.3542335783"
]

def extraer_e_indexar_con_metadata(urls):
    print(f"Iniciando procesamiento de {len(urls)} bloques de URLs...")
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36',
        'Accept': 'application/json'
    }

    # Limpiamos el índice geoespacial viejo antes de empezar
    r.delete(REDIS_GEO_KEY)
    
    total_indexadas = 0
    pipe = r.pipeline()

    for i, url in enumerate(urls):
        print(f"Consultando bloque {i+1}/{len(urls)}...", end=" ")
        try:
            respuesta = requests.get(url, headers=headers, timeout=10)
            if respuesta.status_code == 200:
                datos = respuesta.json()
                features = datos.get('features', [])
                print(f"¡Atrapadas {len(features)} cámaras!")
                
                for feature in features:
                    props = feature.get('properties', {})
                    
                    # CORRECCIÓN CLAVE: Usamos 'id_unico' con guion bajo tal como viene en el JSON
                    id_camara = props.get('id_unico') or props.get('id') or props.get('id_camara')
                    if not id_camara:
                        id_camara = f"C5_GEN_{total_indexadas}"
                        
                    # Capturamos latitud y longitud
                    lat = props.get('latitud') or props.get('coory') or props.get('y')
                    lon = props.get('longitud') or props.get('coorx') or props.get('x')
                    
                    if lat and lon:
                        try:
                            f_lon, f_lat = float(lon), float(lat)
                            s_id = str(id_camara)
                            
                            # 1. Agregar al índice geoespacial con su ID real (ej. CAM-01578)
                            pipe.geoadd(REDIS_GEO_KEY, (f_lon, f_lat, s_id))
                            
                            # 2. Guardar toda la metadata detallada con los campos exactos
                            hash_key = f"meta:camara:{s_id}"
                            metadata_limpia = {
                                "id": s_id,
                                "direccion": str(props.get('dirección', 'N/A')),
                                "esquina": str(props.get('esquina', 'N/A')),
                                "colonia": str(props.get('colonia', 'N/A')),
                                "alcaldia": str(props.get('alcaldia', 'N/A')),
                                "poste": str(props.get('tipo de po', 'N/A')),
                                "boton": str(props.get('boton', 'N/A')),
                                "altavoz": str(props.get('altavoz', 'N/A')),
                                "lat": str(f_lat),
                                "lon": str(f_lon)
                            }
                            pipe.hset(hash_key, mapping=metadata_limpia)
                            total_indexadas += 1
                            
                        except ValueError:
                            pass
            else:
                print(f"Error HTTP {respuesta.status_code}")
        except Exception as e:
            print(f"Error de conexión: {e}")

    # Ejecutamos todas las operaciones acumuladas en Redis
    pipe.execute()
    print(f"\n✅ ¡Proceso terminado! Se indexaron exitosamente {total_indexadas} cámaras con su ID real (`CAM-XXXX`) en Redis.")

if __name__ == "__main__":
    extraer_e_indexar_con_metadata(URLS_MANUALES)