const ZONAS_RIESGO = [
    { id: "gam", nombre: "GAM (Gabriel Hernández / La Cienega)", lat: 19.4850, lng: -99.1120, radio: 1000, nivel: "Alto" },
    { id: "tepito", nombre: "Tepito / Morelos", lat: 19.4440, lng: -99.1250, radio: 800, nivel: "Muy Alto" },
    { id: "doctores", nombre: "Doctores / Buenos Aires", lat: 19.4180, lng: -99.1480, radio: 900, nivel: "Medio-Alto" },
    { id: "iztapalapa", nombre: "Iztapalapa Centro", lat: 19.3580, lng: -99.0920, radio: 1500, nivel: "Alto" },
    { id: "ecatepec", nombre: "Ecatepec (Límite GAM)", lat: 19.5350, lng: -99.0250, radio: 1800, nivel: "Alto" }
];

let zonasDibujadas = [];
let zonasVisibles = false;

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
let autocomplete = null;
let selectedPlace = null;

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
                strokeOpacity: 0.8
            }
        });
        inicializarAutocomplete(Autocomplete);
        updateMapPosition(); //[cite: 2]
        actualizarZonasCercanas();
    } catch (error) {
        console.error("No se pudo cargar Google Maps:", error); //[cite: 2]
        if (placeholder) placeholder.classList.remove("is-hidden"); //[cite: 2, 4]
        showDashboardMessage("No se pudo cargar el mapa. Revisa la clave y las restricciones de Google Maps."); //[cite: 2]
    }
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

function trazarRuta(destino) {
    if (!directionsService || !directionsRenderer) {
        showRouteMessage("El mapa todavía está cargando. Intenta de nuevo en un momento.");
        return;
    }

    let destinationTarget = null;

    if (selectedPlace && selectedPlace.geometry) {
        destinationTarget = selectedPlace.geometry.location;
    } else if (selectedPlace && selectedPlace.place_id) {
        destinationTarget = { placeId: selectedPlace.place_id };
    } else {
        const textVal = document.getElementById("destination-input").value.trim();

        if (!textVal) {
            return showRouteMessage("Escribe o selecciona un destino.");
        }

        destinationTarget = `${textVal}, México`;
    }

    const originPos = currentPosition
        ? { lat: currentPosition.lat, lng: currentPosition.lng }
        : defaultPosition;

    directionsService.route({
        origin: originPos,
        destination: destinationTarget,
        travelMode: window.google.maps.TravelMode.DRIVING
    }, (response, status) => {
        if (status === "OK") {
            const destinationName = selectedPlace?.name || "Destino seleccionado";

            directionsRenderer.setDirections(response);
            isTripActive = true;
            currentDestination = destinationTarget;

            document.getElementById("route-modal").classList.add("is-hidden");
            document.getElementById("trip-title").textContent = `Recorrido activo hacia: ${destinationName}`;
            document.getElementById("trip-control-button").classList.add("is-active");
            document.getElementById("trip-control-label").textContent = "Finalizar recorrido";
            actualizarControlRecorrido();

            showDashboardMessage("Recorrido iniciado. Monitoreo en vivo activado.");
            selectedPlace = null;
            return;
        }

        console.error("Error en DirectionsService:", status);
        showRouteMessage("No se pudo calcular la ruta. Intenta seleccionar otra opción de la lista.");
    });
}

function finalizarRuta() {
    if (directionsRenderer) {
        directionsRenderer.setDirections({ routes: [] });
    }

    isTripActive = false;
    currentDestination = null;
    selectedPlace = null;
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

function guardarRutaFrecuente(routeKey) {
    if (!currentPosition) {
        document.getElementById("route-message").textContent = "Aún no tenemos tu ubicación actual.";
        return;
    }

    const routes = getFrequentRoutes();
    const lat = currentPosition.lat;
    const lng = currentPosition.lng;

    routes[routeKey] = {
        address: `Ubicación actual (${lat.toFixed(5)}, ${lng.toFixed(5)})`,
        lat,
        lng,
        updatedAt: new Date().toISOString()
    };

    saveFrequentRoutes(routes);
    actualizarRutasFrecuentes();
    document.getElementById("route-message").textContent = "Ubicación guardada correctamente.";
}

function usarRutaFrecuente(routeKey) {
    const routes = getFrequentRoutes();
    const savedRoute = routes[routeKey];

    if (!savedRoute) {
        const label = document.querySelector(`[data-route-key="${routeKey}"] .frequent-route-btn`).textContent;
        const address = window.prompt(`Ingresa la dirección para ${label}:`);

        if (!address?.trim()) return;

        const updatedRoutes = getFrequentRoutes();
        updatedRoutes[routeKey] = {
            address: address.trim(),
            updatedAt: new Date().toISOString()
        };
        saveFrequentRoutes(updatedRoutes);
        actualizarRutasFrecuentes();
        document.getElementById("destination-input").value = address.trim();
        selectedPlace = null;
        trazarRuta(address.trim());
        return;
    }

    document.getElementById("destination-input").value = savedRoute.address;

    if (Number.isFinite(savedRoute.lat) && Number.isFinite(savedRoute.lng)) {
        selectedPlace = {
            formatted_address: savedRoute.address,
            geometry: {
                location: {
                    lat: savedRoute.lat,
                    lng: savedRoute.lng
                }
            }
        };
    } else {
        selectedPlace = null;
    }

    trazarRuta(savedRoute.address);
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
