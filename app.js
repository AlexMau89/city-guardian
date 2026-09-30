const ZONAS_RIESGO = [
    { id: "gam", nombre: "GAM (Gabriel Hernández / La Cienega)", lat: 19.4850, lng: -99.1120, radio: 1000, nivel: "Alto" },
    { id: "tepito", nombre: "Tepito / Morelos", lat: 19.4440, lng: -99.1250, radio: 800, nivel: "Muy Alto" },
    { id: "doctores", nombre: "Doctores / Buenos Aires", lat: 19.4180, lng: -99.1480, radio: 900, nivel: "Medio-Alto" },
    { id: "iztapalapa", nombre: "Iztapalapa Centro", lat: 19.3580, lng: -99.0920, radio: 1500, nivel: "Alto" },
    { id: "ecatepec", nombre: "Ecatepec (Límite GAM)", lat: 19.5350, lng: -99.0250, radio: 1800, nivel: "Alto" }
];

let zonasDibujadas = [];
let zonasVisibles = false;
let camarasMarkers = [];
let camarasVisibles = true;

const STORAGE = {
    users: "guardian_usuarios",
    session: "guardian_sesion",
    alerts: "guardian_alertas",
    savedPlaces: "guardian_lugares_guardados",
    trips: "guardian_viajes",
    locationHistory: "guardian_historial_ubicaciones",
    tutors: "guardian_tutores",
    userTutors: "guardian_usuarios_tutores"
};

const config = window.APP_CONFIG || {};
const defaultPosition = { lat: 19.4326, lng: -99.1332 };

let activeUser = null;
let currentPosition = null;
let locationWatchId = null;
let mapInstance = null;
let locationMarker = null;
let mapsLoadPromise = null;
let directionsService = null;
let directionsRenderer = null;
let isTripActive = false;
let currentDestination = null;
let simulationInterval = null;
let simulationPath = [];
let simulationIndex = 0;
let isSimulating = false;
let deviationCount = 0;
let autocomplete = null;
let selectedPlace = null;
let geocoder = null;
let routeRequestInFlight = false;
let pendingSavedPlaceUpdate = null;
let currentTrip = null;
let c5Postes = [];
let deviationAlertSent = false;
let toastTimer = null;

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("app-version").textContent = config.APP_VERSION || "1.0.0";
    bindEvents();
    restoreSession();
});

function bindEvents() {
    document.querySelectorAll("[data-auth-tab]").forEach(tab => {
        tab.addEventListener("click", () => switchAuthView(tab.dataset.authTab));
    });

    document.getElementById("login-form").addEventListener("submit", iniciarSesion);
    document.getElementById("register-form").addEventListener("submit", registrarUsuario);
    document.getElementById("profile-form").addEventListener("submit", guardarPerfil);
    document.getElementById("panic-button").addEventListener("click", enviarAlertaPanic);
    document.getElementById("zones-button").addEventListener("click", toggleZonasCriticas);
    document.getElementById("trip-control-button").addEventListener("click", manejarControlRecorrido);
    document.getElementById("sim-start-btn").addEventListener("click", iniciarSimulacion);
    document.getElementById("sim-deviate-btn").addEventListener("click", simularDesvio);
    document.getElementById("route-form").addEventListener("submit", manejarFormularioRuta);
    document.getElementById("close-route-button").addEventListener("click", cerrarModalRuta);
    document.querySelectorAll(".saved-place-btn").forEach(button => {
        button.addEventListener("click", () => usarLugarGuardado(button.closest(".saved-place-item").dataset.placeKey));
    });
    document.querySelectorAll(".saved-place-save-btn").forEach(button => {
        button.addEventListener("click", () => guardarLugarGuardado(button.dataset.placeKey));
    });
    document.getElementById("destination-input").addEventListener("input", () => {
        selectedPlace = null;
    });
    document.getElementById("recenter-button").addEventListener("click", centrarMapa);
    document.getElementById("profile-button").addEventListener("click", abrirPerfil);
    document.getElementById("close-profile-button").addEventListener("click", cerrarPerfil);
    document.getElementById("logout-button").addEventListener("click", cerrarSesion);
    document.getElementById("profile-modal").addEventListener("click", event => {
        if (event.target.id === "profile-modal") cerrarPerfil();
    });
    document.getElementById("route-modal").addEventListener("click", event => {
        if (event.target.id === "route-modal") cerrarModalRuta();
    });
    document.getElementById("cancel-location-update").addEventListener("click", cerrarConfirmacionActualizacion);
    document.getElementById("cancel-location-update-close").addEventListener("click", cerrarConfirmacionActualizacion);
    document.getElementById("confirm-location-update").addEventListener("click", confirmarActualizacionRuta);
    document.getElementById("location-update-modal").addEventListener("click", event => {
        if (event.target.id === "location-update-modal") cerrarConfirmacionActualizacion();
    });
}

function restoreSession() {
    const savedSession = readJson(STORAGE.session, null);
    if (savedSession) {
        activeUser = normalizeUser(savedSession);
        saveSession();
        mostrarDashboard();
    }
}

function switchAuthView(viewName) {
    const loginActive = viewName === "login";
    document.getElementById("login-form").classList.toggle("is-hidden", !loginActive);
    document.getElementById("register-form").classList.toggle("is-hidden", loginActive);

    document.querySelectorAll("[data-auth-tab]").forEach(tab => {
        const isActive = tab.dataset.authTab === viewName;
        tab.classList.toggle("is-active", isActive);
        tab.setAttribute("aria-selected", String(isActive));
    });
}

async function iniciarSesion(event) {
    event.preventDefault();
    const identifier = document.getElementById("login-identifier").value.trim().toLowerCase();
    const password = document.getElementById("login-password").value;
    const message = document.getElementById("login-message");

    if (!identifier || !password) {
        showMessage(message, "Completa tu correo o teléfono y contraseña.");
        return;
    }

    const user = getUsers().find(item =>
        String(item.email || "").toLowerCase() === identifier || normalizePhone(item.telefono) === normalizePhone(identifier)
    );

    if (!user) {
        showMessage(message, "No encontramos esa cuenta. Puedes crearla en la pestaña de registro.");
        return;
    }

    if (!user || user.password_hash !== await hashPassword(password)) {
        showMessage(message, "La contraseña no coincide.");
        return;
    }

    activeUser = user;
    saveSession();
    document.getElementById("login-form").reset();
    showMessage(message, "");
    mostrarDashboard();
}

async function registrarUsuario(event) {
    event.preventDefault();
    const name = document.getElementById("register-name").value.trim();
    const phone = document.getElementById("register-phone").value.trim();
    const email = document.getElementById("register-email").value.trim().toLowerCase();
    const password = document.getElementById("register-password").value;
    const confirmation = document.getElementById("register-password-confirm").value;
    const message = document.getElementById("register-message");

    if (!name || !phone || !email || !password || !confirmation) {
        showMessage(message, "Completa todos los campos para crear tu cuenta.");
        return;
    }

    if (password.length < 6) {
        showMessage(message, "La contraseña debe tener al menos 6 caracteres.");
        return;
    }

    if (password !== confirmation) {
        showMessage(message, "Las contraseñas no coinciden.");
        return;
    }

    const users = getUsers();
    const duplicate = users.some(item => String(item.email || "").toLowerCase() === email || normalizePhone(item.telefono) === normalizePhone(phone));
    if (duplicate) {
        showMessage(message, "Ya existe una cuenta con ese correo o teléfono.");
        return;
    }

    activeUser = createUser({ nombre_completo: name, telefono: phone, email, password_hash: await hashPassword(password) });
    saveUsers([...users, activeUser]);
    saveSession();
    document.getElementById("register-form").reset();
    showMessage(message, "");
    mostrarDashboard();
}

function mostrarDashboard() {
    document.getElementById("auth-view").classList.add("is-hidden");
    document.getElementById("dashboard-view").classList.remove("is-hidden");
    document.getElementById("dashboard-greeting").textContent = `Usuario: ${activeUser.nombre_completo || "Sin identificar"}`;
    document.getElementById("profile-initials").textContent = getInitials(activeUser.nombre_completo);
    document.getElementById("call-button").href = `tel:${config.EMERGENCY_PHONE || "911"}`;
    document.getElementById("call-label").textContent = config.EMERGENCY_PHONE || "911";
    fillProfileForm();
    startLocationTracking();
    loadGoogleMap();
}

function cerrarSesion() {
    stopLocationTracking();
    finalizarRuta();
    cerrarModalRuta();
    cerrarConfirmacionActualizacion();
    activeUser = null;
    localStorage.removeItem(STORAGE.session);
    cerrarPerfil();
    document.getElementById("dashboard-view").classList.add("is-hidden");
    document.getElementById("auth-view").classList.remove("is-hidden");
    switchAuthView("login");
}

function startLocationTracking() {
    if (!navigator.geolocation) {
        setLocationStatus("Este dispositivo no permite obtener ubicación.", false);
        return;
    }

    setLocationStatus("Solicitando ubicación…", false);
    locationWatchId = navigator.geolocation.watchPosition(
        updateLocation,
        handleLocationError,
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
}

function stopLocationTracking() {
    if (locationWatchId !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(locationWatchId);
    }
    locationWatchId = null;
}

function updateLocation(position) {
    if (isSimulating && !position.isSimulated) return;

    currentPosition = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: Number.isFinite(position.coords.accuracy) ? Math.round(position.coords.accuracy) : null,
        speed: Number.isFinite(position.coords.speed) ? position.coords.speed : 0,
        capturedAt: new Date().toISOString()
    };

    setLocationStatus("Ubicación en vivo", true);
    document.getElementById("coordinates").textContent = `${currentPosition.lat.toFixed(5)}, ${currentPosition.lng.toFixed(5)} · ±${currentPosition.accuracy} m`;
    updateMapPosition();

    registrarPuntoUbicacion(currentPosition);

    actualizarZonasCercanas(currentPosition.lat, currentPosition.lng);

    if (isTripActive && !position.isSimulated && verificarEstadoRuta(currentPosition.lat, currentPosition.lng)) {
        recalcularYEscalarAlerta(currentPosition);
    }
}

function handleLocationError(error) {
    const messages = {
        1: "Permiso de ubicación denegado.",
        2: "No se pudo determinar tu ubicación.",
        3: "La ubicación tardó demasiado en responder."
    };
    setLocationStatus(messages[error.code] || "Ubicación no disponible.", false);
}

function setLocationStatus(text, live) {
    const status = document.getElementById("location-status");
    status.querySelector("span:last-child").textContent = text;
    status.querySelector(".status-dot").classList.toggle("is-live", live);
}

async function loadGoogleMap() {
    const placeholder = document.getElementById("map-placeholder"); //[cite: 4]

    if (!config.GOOGLE_MAPS_API_KEY) { //[cite: 2, 3]
        if (placeholder) placeholder.classList.remove("is-hidden"); //[cite: 2, 4]
        return;
    }

    try {
        await loadMapsScript(); //[cite: 2]
        const { Map } = await window.google.maps.importLibrary("maps"); //[cite: 2]
        const { DirectionsService, DirectionsRenderer } = await window.google.maps.importLibrary("routes");
        const { Autocomplete } = await window.google.maps.importLibrary("places");
        const { Geocoder } = await window.google.maps.importLibrary("geocoding");
        const initialPosition = currentPosition || defaultPosition; //[cite: 2]

        // Ocultamos el placeholder ANTES de inicializar el mapa para no perder su referencia[cite: 2, 4]
        if (placeholder) placeholder.classList.add("is-hidden"); //[cite: 2, 4]

        mapInstance = new Map(document.getElementById("map"), { //[cite: 2, 4]
            center: initialPosition, //[cite: 2]
            zoom: currentPosition ? 17 : 12, //[cite: 2]
            disableDefaultUI: true, //[cite: 2]
            zoomControl: true, //[cite: 2]
            fullscreenControl: false, //[cite: 2]
            streetViewControl: false, //[cite: 2]
            clickableIcons: false, //[cite: 2]
            mapTypeControl: false //[cite: 2]
        });

        cargarCamarasC5(mapInstance);

        locationMarker = new window.google.maps.Marker({ //[cite: 2]
            map: mapInstance, //[cite: 2]
            position: initialPosition, //[cite: 2]
            title: "Tu ubicación" //[cite: 2]
        });
        directionsService = new DirectionsService();
        directionsRenderer = new DirectionsRenderer({
            map: mapInstance,
            suppressMarkers: false,
            polylineOptions: {
                strokeColor: "#2575fc",
                strokeWeight: 6,
                strokeOpacity: 0.85
            }
        });
        geocoder = new Geocoder();
        inicializarAutocomplete(Autocomplete);
        updateMapPosition(); //[cite: 2]
        actualizarZonasCercanas();
    } catch (error) {
        console.error("No se pudo cargar Google Maps:", error); //[cite: 2]
        if (placeholder) placeholder.classList.remove("is-hidden"); //[cite: 2, 4]
        showDashboardMessage("No se pudo cargar el mapa. Revisa la clave y las restricciones de Google Maps."); //[cite: 2]
    }
}

async function cargarCamarasC5(map) {
    if (!map || !camarasVisibles) return;

    camarasMarkers.forEach(marker => marker.setMap(null));
    camarasMarkers = [];

    try {
        const response = await fetch("./camaras.json");
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const camaras = await response.json();
        c5Postes = Array.isArray(camaras) ? camaras : [];
        const infoWindow = new window.google.maps.InfoWindow();

        camaras.forEach(cam => {
            const lat = parseFloat(cam.lat);
            const lng = parseFloat(cam.lon);

            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

            const tieneBoton = cam.boton && !cam.boton.toUpperCase().includes("SIN");
            const color = tieneBoton ? "#2575fc" : "#b48a3c";
            const center = { lat, lng };
            const circle = new window.google.maps.Circle({
                strokeColor: color,
                strokeOpacity: 0.9,
                strokeWeight: 2,
                fillColor: color,
                fillOpacity: 0.6,
                map,
                center,
                radius: 35
            });

            circle.addListener("click", () => {
                const content = document.createElement("div");
                content.innerHTML = `
                    <strong>Cámara C5</strong>
                    <div>ID: ${escapeHtml(cam.id)}</div>
                    <div>Esquina: ${escapeHtml(cam.esquina)}</div>
                    <div>Colonia: ${escapeHtml(cam.colonia)}</div>
                    <div>Botón: ${escapeHtml(cam.boton)}</div>
                    <div>Altavoz: ${escapeHtml(cam.altavoz)}</div>
                `;
                infoWindow.setContent(content);
                infoWindow.setPosition(center);
                infoWindow.open(map);
            });

            camarasMarkers.push(circle);
        });
    } catch (error) {
        console.error("No se pudieron cargar las cámaras del C5:", error);
    }
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function manejarControlRecorrido() {
    if (isTripActive) {
        finalizarRuta();
        return;
    }

    abrirModalRuta();
}

function abrirModalRuta() {
    const modal = document.getElementById("route-modal");
    const message = document.getElementById("route-message");
    const input = document.getElementById("destination-input");

    selectedPlace = null;
    input.value = "";
    message.textContent = "";
    actualizarLugaresGuardados();
    modal.classList.remove("is-hidden");
    window.setTimeout(() => input.focus(), 0);
}

function cerrarModalRuta() {
    const modal = document.getElementById("route-modal");
    if (modal) modal.classList.add("is-hidden");
}

function showRouteMessage(message) {
    document.getElementById("route-message").textContent = message;
}

function showToast(message) {
    const toast = document.getElementById("app-toast");

    toast.textContent = message;
    toast.classList.remove("is-hidden");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
        toast.classList.add("is-hidden");
    }, 4500);
}

function manejarFormularioRuta(event) {
    event.preventDefault();
    trazarRuta(document.getElementById("destination-input").value);
}

function inicializarAutocomplete(Autocomplete) {
    if (autocomplete) return;

    autocomplete = new Autocomplete(document.getElementById("destination-input"), {
        types: ["geocode", "establishment"],
        componentRestrictions: { country: "mx" },
        fields: ["geometry", "formatted_address", "name", "place_id"]
    });

    autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();

        if (place && (place.geometry || place.place_id)) {
            selectedPlace = place;
            return;
        }

        selectedPlace = null;
    });
}

function actualizarControlRecorrido() {
    const button = document.getElementById("trip-control-button");
    const title = button.querySelector("strong");
    const label = document.getElementById("trip-control-label");

    button.classList.toggle("is-active", isTripActive);
    button.setAttribute("aria-pressed", String(isTripActive));

    if (isTripActive) {
        title.textContent = "Finalizar recorrido";
        label.textContent = "Finalizar recorrido";
        return;
    }

    title.textContent = "Iniciar recorrido";
    label.textContent = "Seleccionar destino";
}

function getDirectionsStatusMessage(status) {
    const messages = {
        ZERO_RESULTS: "No se encontró una ruta en automóvil entre tu ubicación y ese destino.",
        NOT_FOUND: "No se pudo localizar el origen o el destino. Revisa la dirección seleccionada.",
        REQUEST_DENIED: "Google Maps rechazó la solicitud. Revisa la API Key, las APIs habilitadas, billing y las restricciones del dominio.",
        INVALID_REQUEST: "La solicitud de ruta no es válida. Selecciona un destino de la lista o escribe una dirección completa.",
        MAX_WAYPOINTS_EXCEEDED: "La ruta excede el número máximo de puntos permitidos.",
        MAX_ROUTE_LENGTH_EXCEEDED: "La ruta solicitada es demasiado larga para calcularse.",
        OVER_QUERY_LIMIT: "Se alcanzó el límite temporal de consultas de Google Maps. Intenta nuevamente en unos segundos.",
        UNKNOWN_ERROR: "Google Maps tuvo un error temporal al calcular la ruta. Intenta nuevamente."
    };

    return messages[status] || `No se pudo calcular la ruta. Código: ${status || "desconocido"}.`;
}

function getGeocoderStatusMessage(status) {
    const messages = {
        ZERO_RESULTS: "No se encontró esa dirección en México.",
        NOT_FOUND: "No se pudo localizar esa dirección.",
        REQUEST_DENIED: "Google Maps rechazó la geocodificación. Revisa la API Key y habilita Geocoding API.",
        INVALID_REQUEST: "La dirección escrita no es válida.",
        OVER_QUERY_LIMIT: "Se alcanzó el límite de geocodificación. Intenta nuevamente más tarde.",
        UNKNOWN_ERROR: "Google Maps tuvo un error temporal al buscar la dirección.",
        GEOCODER_NOT_READY: "La búsqueda de direcciones todavía está cargando. Intenta nuevamente en un momento."
    };

    return messages[status] || `No se pudo localizar la dirección. Código: ${status || "desconocido"}.`;
}

function geocodificarDireccion(address) {
    return new Promise((resolve, reject) => {
        if (!geocoder) {
            const error = new Error("Geocoder no está disponible");
            error.status = "GEOCODER_NOT_READY";
            reject(error);
            return;
        }

        const addressWithCountry = /méxico|mexico/i.test(address)
            ? address
            : `${address}, México`;

        geocoder.geocode({
            address: addressWithCountry,
            componentRestrictions: { country: "MX" }
        }, (results, status) => {
            if (status === "OK" && results?.[0]) {
                resolve(results[0]);
                return;
            }

            const error = new Error(status || "GEOCODING_ERROR");
            error.status = status;
            reject(error);
        });
    });
}

function solicitarRuta(request) {
    return new Promise(resolve => {
        try {
            directionsService.route(request, (response, status) => {
                resolve({ response, status });
            });
        } catch (error) {
            resolve({ response: null, status: "UNKNOWN_ERROR", error });
        }
    });
}

function obtenerLatLngLiteral(location) {
    if (!location) return null;

    const lat = typeof location.lat === "function" ? location.lat() : location.lat;
    const lng = typeof location.lng === "function" ? location.lng() : location.lng;

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
}

async function trazarRuta(destino, savedPlaceKey = null) {
    if (!directionsService || !directionsRenderer) {
        showRouteMessage("El mapa todavía está cargando. Intenta de nuevo en un momento.");
        return;
    }

    if (routeRequestInFlight) {
        showRouteMessage("Ya estamos calculando una ruta. Espera un momento.");
        return;
    }

    if (!currentPosition) {
        showRouteMessage("Aún no tenemos tu ubicación GPS. Permite el acceso a ubicación e inténtalo de nuevo.");
        return;
    }

    routeRequestInFlight = true;
    let destinationTarget = null;
    let destinationName = "Destino seleccionado";
    let geocodedResult = null;

    try {
        if (selectedPlace?.geometry?.location) {
            destinationTarget = selectedPlace.geometry.location;
            destinationName = selectedPlace.name || selectedPlace.formatted_address || destinationName;
        } else if (selectedPlace?.place_id) {
            destinationTarget = { placeId: selectedPlace.place_id };
            destinationName = selectedPlace.name || destinationName;
        } else {
            const textVal = typeof destino === "string"
                ? destino.trim()
                : document.getElementById("destination-input").value.trim();

            if (!textVal) {
                showRouteMessage("Escribe o selecciona un destino.");
                return;
            }

            showRouteMessage("Buscando destino...");
            geocodedResult = await geocodificarDireccion(textVal);
            destinationTarget = geocodedResult.geometry.location;
            destinationName = geocodedResult.formatted_address || textVal;
        }

        const originPos = {
            lat: currentPosition.lat,
            lng: currentPosition.lng
        };

        showRouteMessage("Calculando ruta...");

        const { response, status, error } = await solicitarRuta({
            origin: originPos,
            destination: destinationTarget,
            travelMode: window.google.maps.TravelMode.DRIVING
        });

        if (status === "OK") {
            directionsRenderer.setDirections(response);
            isTripActive = true;
            currentDestination = destinationTarget;
            deviationCount = 0;
            document.getElementById("dashboard-view")?.classList.remove("high-alert");

            const route = response.routes[0];
            if (route && route.overview_path) {
                simulationPath = route.overview_path;
            }
            document.getElementById("simulation-controls").classList.remove("is-hidden");

            if (savedPlaceKey && geocodedResult) {
                const coordinates = obtenerLatLngLiteral(geocodedResult.geometry.location);
                if (coordinates) {
                    const label = getPlaceLabel(savedPlaceKey);
                    const places = getSavedPlaces();
                    const previous = getSavedPlace(savedPlaceKey);
                    const savedPlace = {
                        id_lugar: previous?.id_lugar || createId(),
                        id_usuario: activeUser?.id_usuario || null,
                        etiqueta: label,
                        direccion_texto: geocodedResult.formatted_address || destinationName,
                        lat: coordinates.lat,
                        lon: coordinates.lng,
                        creado_en: previous?.creado_en || new Date().toISOString()
                    };
                    saveSavedPlaces([...places.filter(place => place.etiqueta !== label), savedPlace]);
                    actualizarLugaresGuardados();
                }
            }

            currentTrip = crearViaje({
                nombre_destino: destinationName,
                origen_lat: originPos.lat,
                origen_lon: originPos.lng,
                destino_lat: obtenerLatLngLiteral(destinationTarget)?.lat || null,
                destino_lon: obtenerLatLngLiteral(destinationTarget)?.lng || null,
                ruta_oficial: (route?.overview_path || []).map(point => ({
                    lat: typeof point.lat === "function" ? point.lat() : point.lat,
                    lon: typeof point.lng === "function" ? point.lng() : point.lng
                })),
                eta_original: route?.legs?.[0]?.duration?.value || null,
                distancia_total_metros: route?.legs?.[0]?.distance?.value || null
            });
            deviationAlertSent = false;
            saveTrip(currentTrip);
            if (config.API_BASE_URL) sendToApi("/viajes", currentTrip);

            document.getElementById("route-modal").classList.add("is-hidden");
            document.getElementById("trip-title").textContent = `Recorrido activo hacia: ${destinationName}`;
            actualizarControlRecorrido();
            showDashboardMessage(`Ruta trazada con éxito hacia ${destinationName}.`);
            showRouteMessage("");
            selectedPlace = null;
            return;
        }

        console.error("Error en DirectionsService:", status, error || "");
        showRouteMessage(getDirectionsStatusMessage(status));
    } catch (error) {
        console.error("Error preparando la ruta:", error);
        showRouteMessage(error.status ? getGeocoderStatusMessage(error.status) : "No se pudo preparar la ruta. Intenta nuevamente.");
    } finally {
        routeRequestInFlight = false;
    }
}

function iniciarSimulacion() {
    if (!simulationPath.length) return;

    isSimulating = true;
    clearInterval(simulationInterval);
    simulationIndex = 0;
    simulationInterval = setInterval(() => {
        if (simulationIndex >= simulationPath.length) {
            clearInterval(simulationInterval);
            simulationInterval = null;
            showDashboardMessage("Simulación finalizada: destino alcanzado.");
            return;
        }

        const point = simulationPath[simulationIndex];
        const lat = point.lat();
        const lng = point.lng();
        const simPosition = {
            coords: {
                latitude: lat,
                longitude: lng,
                accuracy: 5
            },
            isSimulated: true
        };

        currentPosition = {
            lat,
            lng,
            accuracy: 5,
            speed: 0,
            capturedAt: new Date().toISOString()
        };

        updateLocation(simPosition);
        if (locationMarker) locationMarker.setPosition({ lat, lng });
        if (mapInstance) mapInstance.panTo({ lat, lng });

        simulationIndex++;
    }, 1500);
}

function simularDesvio() {
    clearInterval(simulationInterval);
    simulationInterval = null;
    isSimulating = true;

    const basePosition = currentPosition || defaultPosition;
    const posicionDesviada = {
        lat: basePosition.lat + 0.0030,
        lng: basePosition.lng - 0.0030
    };

    updateLocation({
        coords: {
            latitude: posicionDesviada.lat,
            longitude: posicionDesviada.lng,
            accuracy: 10
        },
        isSimulated: true
    });
    recalcularYEscalarAlerta(posicionDesviada);
}

function recalcularYEscalarAlerta(nuevaPosicion) {
    deviationCount++;

    if (currentTrip) {
        currentTrip.contador_desvios = deviationCount;
        if (deviationCount >= 3) currentTrip.estado = "ALERTA";
        saveTrip(currentTrip);
    }

    if (deviationCount === 1) {
        showDashboardMessage("Reenrutando. Nueva ruta calculada.");
    } else if (deviationCount === 2) {
        showDashboardMessage("Advertencia: segundo desvío detectado. Notificando a tutores.");
        navigator.vibrate?.([200, 100, 200]);
    } else if (deviationCount >= 3) {
        showDashboardMessage("Alerta crítica: tres desvíos reiterados. Activando protocolo de emergencia.");
        document.getElementById("dashboard-view")?.classList.add("high-alert");
        navigator.vibrate?.([500, 200, 500, 200, 500]);
        if (!deviationAlertSent) {
            registrarAlerta({
                tipo_alerta: "DESVIO_REITERADO",
                nivel_gravedad: "ALTA",
                position: nuevaPosicion
            });
            deviationAlertSent = true;
        }
    }

    if (!directionsService || !directionsRenderer || !currentDestination) {
        console.error("No se puede recalcular la ruta: faltan servicios o destino.");
        return;
    }

    directionsService.route({
        origin: { lat: nuevaPosicion.lat, lng: nuevaPosicion.lng },
        destination: currentDestination,
        travelMode: window.google.maps.TravelMode.DRIVING
    }, (response, status) => {
        if (status === "OK") {
            directionsRenderer.setDirections(response);
            const route = response.routes[0];
            if (route && route.overview_path) {
                simulationPath = route.overview_path;
                simulationIndex = 0;
            }
            return;
        }

        console.error("No se pudo recalcular la ruta:", status);
    });
}

function verificarEstadoRuta(userLat, userLng) {
    if (!isTripActive || !simulationPath.length) return false;
    if (!Number.isFinite(userLat) || !Number.isFinite(userLng)) return false;

    const distanciaMinimaKm = simulationPath.reduce((minDistance, point) => {
        const pointLat = typeof point.lat === "function" ? point.lat() : point.lat;
        const pointLng = typeof point.lng === "function" ? point.lng() : point.lng;

        if (!Number.isFinite(pointLat) || !Number.isFinite(pointLng)) return minDistance;
        return Math.min(minDistance, calcularDistanciaKm(userLat, userLng, pointLat, pointLng));
    }, Number.POSITIVE_INFINITY);

    if (distanciaMinimaKm <= 0.35) return false;

    setLocationStatus("Desvío detectado", false);
    showDashboardMessage("ALERTA DE SEGURIDAD: Desvío detectado. Enviando notificación a los tutores.");
    return true;
}

function finalizarRuta(finalState = "FINALIZADO") {
    isSimulating = false;
    clearInterval(simulationInterval);
    simulationInterval = null;
    if (currentTrip && !currentTrip.fin_viaje) {
        currentTrip.estado = currentTrip.estado === "ALERTA" ? "ALERTA" : finalState;
        currentTrip.contador_desvios = deviationCount;
        currentTrip.fin_viaje = new Date().toISOString();
        saveTrip(currentTrip);
        if (config.API_BASE_URL) sendToApi(`/viajes/${encodeURIComponent(currentTrip.id_viaje)}`, currentTrip, "PUT");
    }

    deviationCount = 0;
    deviationAlertSent = false;
    document.getElementById("dashboard-view")?.classList.remove("high-alert");

    if (directionsRenderer) {
        directionsRenderer.setDirections({ routes: [] });
    }

    isTripActive = false;
    currentDestination = null;
    selectedPlace = null;
    document.getElementById("simulation-controls").classList.add("is-hidden");
    simulationPath = [];
    simulationIndex = 0;
    actualizarControlRecorrido();
    document.getElementById("trip-title").textContent = "Monitoreo personal disponible";
    currentTrip = null;
}

function getSavedPlaces() {
    const stored = readJson(STORAGE.savedPlaces, []);
    if (Array.isArray(stored)) {
        return stored.filter(place => !place.id_usuario || place.id_usuario === activeUser?.id_usuario);
    }

    return Object.entries(stored || {}).map(([placeKey, place]) => ({
        id_lugar: createId(),
        id_usuario: activeUser?.id_usuario || null,
        etiqueta: getPlaceLabel(placeKey),
        direccion_texto: place.address || "",
        lat: Number.isFinite(place.lat) ? place.lat : null,
        lon: Number.isFinite(place.lon) ? place.lon : (Number.isFinite(place.lng) ? place.lng : null),
        creado_en: place.createdAt || place.updatedAt || new Date().toISOString()
    }));
}

function saveSavedPlaces(places) {
    const stored = readJson(STORAGE.savedPlaces, []);
    const otherUsersPlaces = Array.isArray(stored)
        ? stored.filter(place => place.id_usuario && place.id_usuario !== activeUser?.id_usuario)
        : [];
    localStorage.setItem(STORAGE.savedPlaces, JSON.stringify([...places, ...otherUsersPlaces]));
}

function getPlaceLabel(placeKey) {
    const button = document.querySelector(`.saved-place-item[data-place-key="${placeKey}"] .saved-place-btn`);
    return button?.textContent.trim() || "Lugar guardado";
}

function getSavedPlace(placeKey) {
    return getSavedPlaces().find(place => place.etiqueta === getPlaceLabel(placeKey));
}

function actualizarLugaresGuardados() {
    const places = getSavedPlaces();

    document.querySelectorAll(".saved-place-item").forEach(item => {
        const place = getSavedPlace(item.dataset.placeKey);
        const address = item.querySelector(".saved-place-address");
        const saveButton = item.querySelector(".saved-place-save-btn");

        address.textContent = place?.direccion_texto || "Sin configurar";
        saveButton.textContent = place ? "Actualizar actual" : "Guardar actual";
    });
}

function abrirConfirmacionActualizacion(placeKey) {
    pendingSavedPlaceUpdate = placeKey;
    document.getElementById("location-update-message").textContent =
        `¿Deseas actualizar ${getPlaceLabel(placeKey)} con tu ubicación actual?`;
    document.getElementById("location-update-modal").classList.remove("is-hidden");
}

function cerrarConfirmacionActualizacion() {
    pendingSavedPlaceUpdate = null;
    document.getElementById("location-update-modal").classList.add("is-hidden");
}

async function confirmarActualizacionRuta() {
    const placeKey = pendingSavedPlaceUpdate;
    cerrarConfirmacionActualizacion();
    if (placeKey) await persistirLugarGuardado(placeKey, true);
}

async function persistirLugarGuardado(placeKey, wasUpdate = false) {
    const position = currentPosition || await getOneLocation();

    if (!position) {
        showToast("No se pudo obtener tu ubicación actual.");
        showRouteMessage("Permite el acceso a ubicación para guardar este sitio.");
        return;
    }

    const places = getSavedPlaces();
    const lat = position.lat;
    const lng = position.lng;
    const label = getPlaceLabel(placeKey);
    const savedPlace = {
        id_lugar: getSavedPlace(placeKey)?.id_lugar || createId(),
        id_usuario: activeUser?.id_usuario || null,
        etiqueta: label,
        direccion_texto: `Ubicación actual (${lat.toFixed(5)}, ${lng.toFixed(5)})`,
        lat,
        lon: lng,
        creado_en: getSavedPlace(placeKey)?.creado_en || new Date().toISOString()
    };

    saveSavedPlaces([...places.filter(place => place.etiqueta !== label), savedPlace]);
    actualizarLugaresGuardados();
    showToast(`${label} ${wasUpdate ? "actualizada" : "guardada"} correctamente.`);
}

async function guardarLugarGuardado(placeKey) {
    if (getSavedPlace(placeKey)) {
        abrirConfirmacionActualizacion(placeKey);
        return;
    }

    await persistirLugarGuardado(placeKey);
}

async function usarLugarGuardado(placeKey) {
    if (routeRequestInFlight) {
        showRouteMessage("Ya estamos calculando una ruta. Espera un momento.");
        return;
    }

    const savedPlace = getSavedPlace(placeKey);

    if (!savedPlace) {
        const address = window.prompt(`Ingresa la dirección para ${getPlaceLabel(placeKey)}:`);
        if (!address?.trim()) return;

        saveSavedPlaces([...getSavedPlaces(), {
            id_lugar: createId(),
            id_usuario: activeUser?.id_usuario || null,
            etiqueta: getPlaceLabel(placeKey),
            direccion_texto: address.trim(),
            lat: null,
            lon: null,
            creado_en: new Date().toISOString()
        }]);
        actualizarLugaresGuardados();
        document.getElementById("destination-input").value = address.trim();
        selectedPlace = null;
        await trazarRuta(address.trim(), placeKey);
        return;
    }

    const address = savedPlace.direccion_texto;
    document.getElementById("destination-input").value = address;

    const savedCoordinates = Number.isFinite(savedPlace.lat) && Number.isFinite(savedPlace.lon)
        ? { lat: savedPlace.lat, lng: savedPlace.lon }
        : null;

    selectedPlace = savedCoordinates
        ? {
            name: savedPlace.etiqueta,
            formatted_address: address,
            geometry: { location: savedCoordinates }
        }
        : null;

    await trazarRuta(address, placeKey);
}

function loadMapsScript() {
    if (window.google?.maps?.importLibrary) return Promise.resolve();
    if (mapsLoadPromise) return mapsLoadPromise;

    mapsLoadPromise = new Promise((resolve, reject) => {
        window.__guardianMapsReady = resolve;
        const script = document.createElement("script");
        script.async = true;
        script.defer = true;
        script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(config.GOOGLE_MAPS_API_KEY)}&v=weekly&loading=async&libraries=places&callback=__guardianMapsReady`;
        script.onerror = () => reject(new Error("Google Maps no respondió"));
        document.head.appendChild(script);
    });

    return mapsLoadPromise;
}

function updateMapPosition() {
    // Validamos también locationMarker para evitar el error de setPosition null[cite: 2]
    if (!currentPosition || !mapInstance || !locationMarker) return; //[cite: 2]
    const position = { lat: currentPosition.lat, lng: currentPosition.lng }; //[cite: 2]
    locationMarker.setPosition(position); //[cite: 2]
    mapInstance.panTo(position); //[cite: 2]
}

function centrarMapa() {
    if (currentPosition && mapInstance) {
        mapInstance.panTo({ lat: currentPosition.lat, lng: currentPosition.lng });
        mapInstance.setZoom(17);
        return;
    }
    showDashboardMessage("Aún estamos esperando la ubicación del dispositivo.");
}

async function enviarAlertaPanic() {
    const position = currentPosition || await getOneLocation();
    const alert = registrarAlerta({
        tipo_alerta: "BOTON_PANICO",
        nivel_gravedad: "ALTA",
        position
    });
    navigator.vibrate?.([180, 80, 180]);
    showDashboardMessage(position ? "Alerta registrada con ubicación para la Central de Emergencias." : "Alerta registrada. No se obtuvo la ubicación actual.");

    if (config.API_BASE_URL && alert) await sendToApi("/alertas", alert);
}

function getOneLocation() {
    return new Promise(resolve => {
        if (!navigator.geolocation) return resolve(null);
        navigator.geolocation.getCurrentPosition(
            position => resolve({
                lat: position.coords.latitude,
                lng: position.coords.longitude,
                accuracy: Number.isFinite(position.coords.accuracy) ? Math.round(position.coords.accuracy) : null,
                speed: Number.isFinite(position.coords.speed) ? position.coords.speed : 0,
                capturedAt: new Date().toISOString()
            }),
            () => resolve(null),
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 10000 }
        );
    });
}

function abrirPerfil() {
    fillProfileForm();
    document.getElementById("profile-modal").classList.remove("is-hidden");
    document.getElementById("profile-name").focus();
}

function cerrarPerfil() {
    document.getElementById("profile-modal").classList.add("is-hidden");
}

function fillProfileForm() {
    if (!activeUser) return;
    document.getElementById("profile-name").value = activeUser.nombre_completo || "";
    document.getElementById("profile-phone").value = activeUser.telefono || "";
    document.getElementById("profile-email").value = activeUser.email || "";
    document.getElementById("profile-device").value = activeUser.dispositivo_modelo || "";
}

async function guardarPerfil(event) {
    event.preventDefault();
    const updated = {
        ...activeUser,
        nombre_completo: document.getElementById("profile-name").value.trim(),
        telefono: document.getElementById("profile-phone").value.trim(),
        email: document.getElementById("profile-email").value.trim().toLowerCase(),
        dispositivo_modelo: document.getElementById("profile-device").value.trim()
    };

    if (!updated.nombre_completo || !updated.telefono || !updated.email) {
        showMessage(document.getElementById("profile-message"), "Nombre, teléfono y correo son obligatorios.");
        return;
    }

    const users = getUsers().filter(user => user.id_usuario !== activeUser.id_usuario);
    saveUsers([...users, updated]);
    activeUser = updated;
    saveSession();
    document.getElementById("dashboard-greeting").textContent = `Usuario: ${activeUser.nombre_completo}`;
    document.getElementById("profile-initials").textContent = getInitials(activeUser.nombre_completo);
    showMessage(document.getElementById("profile-message"), "Cambios guardados.");

    if (config.API_BASE_URL && updated.id_usuario) {
        await sendToApi(`/usuarios/${encodeURIComponent(updated.id_usuario)}`, updated, "PUT");
    }
}

async function sendToApi(path, payload, method = "POST") {
    try {
        await fetch(`${config.API_BASE_URL.replace(/\/$/, "")}${path}`, {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
    } catch (error) {
        console.error("La API no está disponible:", error);
    }
}

function createUser(data) {
    return {
        id_usuario: data.id_usuario || createId(),
        nombre_completo: data.nombre_completo || "Usuario",
        telefono: data.telefono || "",
        email: data.email || "",
        password_hash: data.password_hash || "",
        push_token: data.push_token || null,
        dispositivo_modelo: data.dispositivo_modelo || navigator.userAgent.slice(0, 48),
        app_version: data.app_version || config.APP_VERSION || "1.0.0",
        creado_en: data.creado_en || new Date().toISOString()
    };
}

function normalizeUser(data) {
    return createUser(data);
}

function createId() {
    return crypto.randomUUID ? crypto.randomUUID() : `guardian-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function crearViaje(data = {}) {
    return {
        id_viaje: data.id_viaje || createId(),
        id_usuario: data.id_usuario || activeUser?.id_usuario || null,
        nombre_destino: data.nombre_destino || "Destino sin especificar",
        origen_lat: data.origen_lat ?? null,
        origen_lon: data.origen_lon ?? null,
        destino_lat: data.destino_lat ?? null,
        destino_lon: data.destino_lon ?? null,
        ruta_oficial: Array.isArray(data.ruta_oficial) ? data.ruta_oficial : [],
        eta_original: data.eta_original ?? null,
        distancia_total_metros: data.distancia_total_metros ?? null,
        contador_desvios: data.contador_desvios || 0,
        estado: data.estado || "EN_CURSO",
        inicio_viaje: data.inicio_viaje || new Date().toISOString(),
        fin_viaje: data.fin_viaje || null
    };
}

function getTrips() {
    return readJson(STORAGE.trips, []).filter(trip => !trip.id_usuario || trip.id_usuario === activeUser?.id_usuario);
}

function saveTrip(trip) {
    const stored = readJson(STORAGE.trips, []);
    const otherUsersTrips = Array.isArray(stored)
        ? stored.filter(item => item.id_usuario && item.id_usuario !== activeUser?.id_usuario)
        : [];
    const currentUserTrips = getTrips().filter(item => item.id_viaje !== trip.id_viaje);
    localStorage.setItem(STORAGE.trips, JSON.stringify([trip, ...currentUserTrips, ...otherUsersTrips]));
}

function registrarPuntoUbicacion(position) {
    if (!isTripActive || !currentTrip || !activeUser || !position) return;

    const point = {
        id_punto: createId(),
        id_viaje: currentTrip.id_viaje,
        lat: position.lat,
        lon: position.lng,
        velocidad_kmh: Number.isFinite(position.speed) ? Number((position.speed * 3.6).toFixed(2)) : 0,
        precision_metros: position.accuracy,
        fecha_hora: position.capturedAt || new Date().toISOString()
    };
    const points = readJson(STORAGE.locationHistory, []);
    localStorage.setItem(STORAGE.locationHistory, JSON.stringify([point, ...points].slice(0, 2000)));

    if (config.API_BASE_URL) sendToApi("/historial-ubicaciones", point);
}

function getNearestC5(position) {
    if (!position || !c5Postes.length) return { id: null, distancia: null };

    return c5Postes.reduce((nearest, camera) => {
        const lat = Number(camera.lat);
        const lon = Number(camera.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return nearest;
        const distance = calcularDistanciaKm(position.lat, position.lng, lat, lon) * 1000;
        return distance < nearest.distancia ? { id: camera.id || null, distancia: Math.round(distance) } : nearest;
    }, { id: null, distancia: Number.POSITIVE_INFINITY });
}

function registrarAlerta(data = {}) {
    const position = data.position || currentPosition;
    const nearestC5 = getNearestC5(position);
    const alert = {
        id_alerta: createId(),
        id_viaje: currentTrip?.id_viaje || null,
        tipo_alerta: data.tipo_alerta || "BOTON_PANICO",
        nivel_gravedad: data.nivel_gravedad || "ALTA",
        lat_incidente: position?.lat ?? null,
        lon_incidente: position?.lng ?? null,
        c5_poste_cercano_id: nearestC5.id,
        c5_distancia_metros: Number.isFinite(nearestC5.distancia) ? nearestC5.distancia : null,
        telemetria_snapshot: {
            posicion: position || null,
            viaje: currentTrip || null,
            registrado_en: new Date().toISOString()
        },
        estado_resolucion: "NO_ATENDIDA",
        creado_en: new Date().toISOString()
    };

    const alerts = readJson(STORAGE.alerts, []);
    localStorage.setItem(STORAGE.alerts, JSON.stringify([alert, ...alerts]));
    if (config.API_BASE_URL) sendToApi("/alertas", alert);
    return alert;
}

function createTutor(data = {}) {
    return {
        id_tutor: data.id_tutor || createId(),
        nombre_completo: data.nombre_completo || "",
        telefono: data.telefono || "",
        email: data.email || "",
        relacion: data.relacion || "",
        permisos: Array.isArray(data.permisos) ? data.permisos : []
    };
}

function getTutors() {
    return readJson(STORAGE.tutors, []).map(createTutor);
}

function saveTutor(tutor) {
    const tutors = getTutors().filter(item => item.id_tutor !== tutor.id_tutor);
    localStorage.setItem(STORAGE.tutors, JSON.stringify([...tutors, createTutor(tutor)]));
}

function associateTutor(tutorId, permissions = []) {
    const associations = readJson(STORAGE.userTutors, []);
    const association = {
        id_usuario: activeUser?.id_usuario || null,
        id_tutor: tutorId,
        permisos: Array.isArray(permissions) ? permissions : []
    };
    const remaining = associations.filter(item => !(item.id_usuario === association.id_usuario && item.id_tutor === tutorId));
    localStorage.setItem(STORAGE.userTutors, JSON.stringify([...remaining, association]));
}

async function hashPassword(password) {
    const data = new TextEncoder().encode(password);
    const hash = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
}

function getUsers() {
    return readJson(STORAGE.users, []);
}

function saveUsers(users) {
    localStorage.setItem(STORAGE.users, JSON.stringify(users));
}

function saveSession() {
    localStorage.setItem(STORAGE.session, JSON.stringify(activeUser));
}

function readJson(key, fallback) {
    try {
        return JSON.parse(localStorage.getItem(key)) || fallback;
    } catch {
        return fallback;
    }
}

function normalizePhone(phone) {
    return String(phone || "").replace(/\D/g, "");
}

function getInitials(name) {
    return String(name || "G")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(part => part[0].toUpperCase())
        .join("") || "G";
}

function showMessage(element, message) {
    element.textContent = message;
}

function showDashboardMessage(message) {
    const element = document.getElementById("dashboard-message");
    element.textContent = message;
    window.clearTimeout(showDashboardMessage.timeout);
    showDashboardMessage.timeout = window.setTimeout(() => {
        element.textContent = "";
    }, 7000);
}

function toggleZonasCriticas() {
    zonasVisibles = !zonasVisibles;
    const button = document.getElementById("zones-button");
    const label = document.getElementById("zones-label");

    if (zonasVisibles) {
        button.classList.add("is-active");
        label.textContent = "Ocultar áreas de riesgo";
        actualizarZonasCercanas();
        return;
    }

    button.classList.remove("is-active");
    label.textContent = "Mostrar áreas de riesgo";
    limpiarZonas();
    document.getElementById("dashboard-message").textContent = "";
}

function limpiarZonas() {
    zonasDibujadas.forEach(circle => circle.setMap(null));
    zonasDibujadas = [];
}

// --- FUNCIONES DE DETECCIÓN DE ZONAS CERCANAS ---

function calcularDistanciaKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function actualizarZonasCercanas(userLat = currentPosition?.lat, userLng = currentPosition?.lng) {
    if (!mapInstance || !zonasVisibles) return;
    if (!Number.isFinite(userLat) || !Number.isFinite(userLng)) return;

    // Limpiar círculos dibujados anteriormente
    limpiarZonas();

    let zonaCercanaDetectada = null;

    ZONAS_RIESGO.forEach(zona => {
        const distanciaKm = calcularDistanciaKm(userLat, userLng, zona.lat, zona.lng);

        // Dibuja en el mapa si la zona está a menos de 10 km del usuario
        if (distanciaKm <= 10.0) {
            const circle = new google.maps.Circle({
                strokeColor: "#d32f2f",
                strokeOpacity: 0.8,
                strokeWeight: 2,
                fillColor: "#d32f2f",
                fillOpacity: 0.35,
                map: mapInstance,
                center: { lat: zona.lat, lng: zona.lng },
                radius: zona.radio
            });

            zonasDibujadas.push(circle);

            // Si el usuario está físicamente dentro del radio de la zona
            if (distanciaKm * 1000 <= zona.radio) {
                zonaCercanaDetectada = zona;
            }
        }
    });

    if (zonaCercanaDetectada) {
        showDashboardMessage(`ATENCIÓN: Te encuentras dentro de una zona de riesgo: ${zonaCercanaDetectada.nombre}`);
    }
}
