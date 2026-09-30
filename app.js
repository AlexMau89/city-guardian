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
    users: "rs_usuarios",
    session: "rs_sesion",
    alerts: "rs_alertas",
    frequentRoutes: "rs_rutas_frecuentes"
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
let pendingFrequentRouteUpdate = null;
let toastTimer = null;

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("app-version").textContent = config.APP_VERSION || "0.3.0";
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
    document.querySelectorAll(".frequent-route-btn").forEach(button => {
        button.addEventListener("click", () => usarRutaFrecuente(button.closest(".frequent-route-item").dataset.routeKey));
    });
    document.querySelectorAll(".frequent-route-save-btn").forEach(button => {
        button.addEventListener("click", () => guardarRutaFrecuente(button.dataset.routeKey));
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
        activeUser = savedSession;
        mostrarDashboard();
        return;
    }

    // Compatibility with the first prototype, which stored only the username.
    const oldUser = localStorage.getItem("cg_usuario");
    if (oldUser) {
        activeUser = createUser({
            name: oldUser,
            email: oldUser.includes("@") ? oldUser : "",
            phone: ""
        });
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
        item.email.toLowerCase() === identifier || normalizePhone(item.phone) === normalizePhone(identifier)
    );

    if (!user) {
        showMessage(message, "No encontramos esa cuenta. Puedes crearla en la pestaña de registro.");
        return;
    }

    if (!user || user.passwordHash !== await hashPassword(password)) {
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
    const duplicate = users.some(item => item.email.toLowerCase() === email || normalizePhone(item.phone) === normalizePhone(phone));
    if (duplicate) {
        showMessage(message, "Ya existe una cuenta con ese correo o teléfono.");
        return;
    }

    activeUser = createUser({ name, phone, email, passwordHash: await hashPassword(password) });
    saveUsers([...users, activeUser]);
    saveSession();
    document.getElementById("register-form").reset();
    showMessage(message, "");
    mostrarDashboard();
}

function mostrarDashboard() {
    document.getElementById("auth-view").classList.add("is-hidden");
    document.getElementById("dashboard-view").classList.remove("is-hidden");
    document.getElementById("dashboard-greeting").textContent = `Hola, ${activeUser.name || "usuario"}`;
    document.getElementById("profile-initials").textContent = getInitials(activeUser.name);
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
    localStorage.removeItem("cg_usuario");
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
        accuracy: Math.round(position.coords.accuracy),
        speed: position.coords.speed || 0,
        capturedAt: new Date().toISOString()
    };

    setLocationStatus("Ubicación en vivo", true);
    document.getElementById("coordinates").textContent = `${currentPosition.lat.toFixed(5)}, ${currentPosition.lng.toFixed(5)} · ±${currentPosition.accuracy} m`;
    updateMapPosition();

    actualizarZonasCercanas(currentPosition.lat, currentPosition.lng);
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
                strokeColor: "#4285F4",
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
        const infoWindow = new window.google.maps.InfoWindow();

        camaras.forEach(cam => {
            const lat = parseFloat(cam.lat);
            const lng = parseFloat(cam.lon);

            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

            const tieneBoton = cam.boton && !cam.boton.toUpperCase().includes("SIN");
            const color = tieneBoton ? "#00E676" : "#FF9800";
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
    actualizarRutasFrecuentes();
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

async function trazarRuta(destino, frequentRouteKey = null) {
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

            if (frequentRouteKey && geocodedResult) {
                const coordinates = obtenerLatLngLiteral(geocodedResult.geometry.location);
                if (coordinates) {
                    const routes = getFrequentRoutes();
                    routes[frequentRouteKey] = {
                        ...routes[frequentRouteKey],
                        address: geocodedResult.formatted_address || destinationName,
                        ...coordinates,
                        updatedAt: new Date().toISOString()
                    };
                    saveFrequentRoutes(routes);
                    actualizarRutasFrecuentes();
                }
            }

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
            showDashboardMessage("🏁 Simulación finalizada: Has llegado a tu destino.");
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

    if (deviationCount === 1) {
        showDashboardMessage("🟡 Reenrutando... Nueva ruta calculada.");
    } else if (deviationCount === 2) {
        showDashboardMessage("🟠 ADVERTENCIA: Segundo desvío detectado. Notificando a tutores.");
        navigator.vibrate?.([200, 100, 200]);
    } else if (deviationCount >= 3) {
        showDashboardMessage("🔴 🚨 ALERTA CRÍTICA: 3 desvíos reincidentes. Activando protocolo de emergencia.");
        document.getElementById("dashboard-view")?.classList.add("high-alert");
        navigator.vibrate?.([500, 200, 500, 200, 500]);
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
    showDashboardMessage("⚠️ ALERTA DE SEGURIDAD: Desvío detectado. Enviando notificación a los tutores.");
    return true;
}

function finalizarRuta() {
    isSimulating = false;
    clearInterval(simulationInterval);
    simulationInterval = null;
    deviationCount = 0;
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
    document.getElementById("trip-title").textContent = "Tu ubicación está protegida";
}

function getFrequentRoutes() {
    return readJson(STORAGE.frequentRoutes, {});
}

function saveFrequentRoutes(routes) {
    localStorage.setItem(STORAGE.frequentRoutes, JSON.stringify(routes));
}

function actualizarRutasFrecuentes() {
    const routes = getFrequentRoutes();

    document.querySelectorAll(".frequent-route-item").forEach(item => {
        const route = routes[item.dataset.routeKey];
        const address = item.querySelector(".frequent-route-address");
        const saveButton = item.querySelector(".frequent-route-save-btn");

        address.textContent = route?.address || "Sin configurar";
        saveButton.textContent = route ? "Actualizar actual" : "Guardar actual";
    });
}

function obtenerEtiquetaRuta(routeKey) {
    const button = document.querySelector(`.frequent-route-item[data-route-key="${routeKey}"] .frequent-route-btn`);
    return button?.textContent.trim() || "Ubicación";
}

function abrirConfirmacionActualizacion(routeKey) {
    pendingFrequentRouteUpdate = routeKey;
    document.getElementById("location-update-message").textContent =
        `¿Deseas actualizar ${obtenerEtiquetaRuta(routeKey)} con tu ubicación actual?`;
    document.getElementById("location-update-modal").classList.remove("is-hidden");
}

function cerrarConfirmacionActualizacion() {
    pendingFrequentRouteUpdate = null;
    document.getElementById("location-update-modal").classList.add("is-hidden");
}

async function confirmarActualizacionRuta() {
    const routeKey = pendingFrequentRouteUpdate;
    cerrarConfirmacionActualizacion();
    if (routeKey) await guardarUbicacionFrecuente(routeKey, true);
}

async function guardarUbicacionFrecuente(routeKey, wasUpdate = false) {
    const position = currentPosition || await getOneLocation();

    if (!position) {
        showToast("No se pudo obtener tu ubicación actual.");
        showRouteMessage("Permite el acceso a ubicación para guardar este sitio.");
        return;
    }

    const routes = getFrequentRoutes();
    const lat = position.lat;
    const lng = position.lng;
    const label = obtenerEtiquetaRuta(routeKey);

    routes[routeKey] = {
        address: `Ubicación actual (${lat.toFixed(5)}, ${lng.toFixed(5)})`,
        lat,
        lng,
        updatedAt: new Date().toISOString()
    };

    saveFrequentRoutes(routes);
    actualizarRutasFrecuentes();
    showToast(`${label} ${wasUpdate ? "actualizada" : "guardada"} correctamente.`);
}

async function guardarRutaFrecuente(routeKey) {
    const routes = getFrequentRoutes();

    if (routes[routeKey]) {
        abrirConfirmacionActualizacion(routeKey);
        return;
    }

    await guardarUbicacionFrecuente(routeKey);
}

async function usarRutaFrecuente(routeKey) {
    if (routeRequestInFlight) {
        showRouteMessage("Ya estamos calculando una ruta. Espera un momento.");
        return;
    }

    const routes = getFrequentRoutes();
    const savedRoute = routes[routeKey];

    if (!savedRoute) {
        const address = window.prompt(`Ingresa la dirección para ${obtenerEtiquetaRuta(routeKey)}:`);
        if (!address?.trim()) return;

        routes[routeKey] = {
            address: address.trim(),
            updatedAt: new Date().toISOString()
        };
        saveFrequentRoutes(routes);
        actualizarRutasFrecuentes();
        document.getElementById("destination-input").value = address.trim();
        selectedPlace = null;
        await trazarRuta(address.trim(), routeKey);
        return;
    }

    document.getElementById("destination-input").value = savedRoute.address;

    const savedCoordinates = Number.isFinite(savedRoute.lat) && Number.isFinite(savedRoute.lng)
        ? { lat: savedRoute.lat, lng: savedRoute.lng }
        : null;

    selectedPlace = savedCoordinates
        ? {
            name: savedRoute.address,
            formatted_address: savedRoute.address,
            geometry: { location: savedCoordinates }
        }
        : null;

    await trazarRuta(savedRoute.address, routeKey);
}

function loadMapsScript() {
    if (window.google?.maps?.importLibrary) return Promise.resolve();
    if (mapsLoadPromise) return mapsLoadPromise;

    mapsLoadPromise = new Promise((resolve, reject) => {
        window.__rumboSeguroMapsReady = resolve;
        const script = document.createElement("script");
        script.async = true;
        script.defer = true;
        script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(config.GOOGLE_MAPS_API_KEY)}&v=weekly&loading=async&libraries=places&callback=__rumboSeguroMapsReady`;
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
    const alert = {
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
        userId: activeUser?.id || null,
        type: "BOTON_PANICO",
        severity: "ALTA",
        latitude: position?.lat || null,
        longitude: position?.lng || null,
        telemetry: position || {},
        status: "NO_ATENDIDA",
        createdAt: new Date().toISOString()
    };

    const alerts = readJson(STORAGE.alerts, []);
    localStorage.setItem(STORAGE.alerts, JSON.stringify([alert, ...alerts]));
    navigator.vibrate?.([180, 80, 180]);
    showDashboardMessage(position ? "Alerta guardada con tu ubicación. Conecta el backend para enviarla a la central." : "Alerta guardada. No se obtuvo la ubicación actual.");

    if (config.API_BASE_URL) {
        await sendToApi("/alertas", alert);
    }
}

function getOneLocation() {
    return new Promise(resolve => {
        if (!navigator.geolocation) return resolve(null);
        navigator.geolocation.getCurrentPosition(
            position => resolve({ lat: position.coords.latitude, lng: position.coords.longitude, accuracy: Math.round(position.coords.accuracy) }),
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
    document.getElementById("profile-name").value = activeUser.name || "";
    document.getElementById("profile-phone").value = activeUser.phone || "";
    document.getElementById("profile-email").value = activeUser.email || "";
    document.getElementById("profile-device").value = activeUser.deviceModel || "";
}

async function guardarPerfil(event) {
    event.preventDefault();
    const updated = {
        ...activeUser,
        name: document.getElementById("profile-name").value.trim(),
        phone: document.getElementById("profile-phone").value.trim(),
        email: document.getElementById("profile-email").value.trim().toLowerCase(),
        deviceModel: document.getElementById("profile-device").value.trim()
    };

    if (!updated.name || !updated.phone || !updated.email) {
        showMessage(document.getElementById("profile-message"), "Nombre, teléfono y correo son obligatorios.");
        return;
    }

    const users = getUsers().filter(user => user.id !== activeUser.id);
    saveUsers([...users, updated]);
    activeUser = updated;
    saveSession();
    document.getElementById("dashboard-greeting").textContent = `Hola, ${activeUser.name}`;
    document.getElementById("profile-initials").textContent = getInitials(activeUser.name);
    showMessage(document.getElementById("profile-message"), "Cambios guardados.");

    if (config.API_BASE_URL && updated.id) {
        await sendToApi(`/usuarios/${encodeURIComponent(updated.id)}`, updated, "PUT");
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
        id: data.id || (crypto.randomUUID ? crypto.randomUUID() : `local-${Date.now()}`),
        name: data.name || "Usuario",
        phone: data.phone || "",
        email: data.email || "",
        passwordHash: data.passwordHash || "",
        deviceModel: data.deviceModel || navigator.userAgent.slice(0, 48),
        appVersion: config.APP_VERSION || "0.3.0",
        createdAt: data.createdAt || new Date().toISOString()
    };
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
    return String(name || "RS")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(part => part[0].toUpperCase())
        .join("") || "RS";
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
                strokeColor: "#FF2D55",
                strokeOpacity: 0.8,
                strokeWeight: 2,
                fillColor: "#FF2D55",
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
        showDashboardMessage(`⚠️ ATENCIÓN: Te encuentras dentro de una zona de riesgo: ${zonaCercanaDetectada.nombre}`);
    }
}
