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
    const tutorForm = document.getElementById("tutor-form");
    if (tutorForm) tutorForm.addEventListener("submit", guardarTutor);
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

const VALIDATION = Object.freeze({
    name: /^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s']{2,40}$/,
    phone: /^\d{10}$/,
    email: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
    password: /^(?=.*[A-Za-z])(?=.*\d).{8,}$/
});

const ADMIN_DEMO_CREDENTIALS = Object.freeze({
    email: "admin@guardian.net",
    password: "Admin1234"
});

function validateFormFields(fields) {
    let isValid = true;

    fields.forEach(fieldConfig => {
        const input = document.getElementById(fieldConfig.id);
        if (!input) {
            isValid = false;
            return;
        }

        const value = input.value.trim();
        const error = validateFieldValue(value, fieldConfig.type, fieldConfig.required !== false);

        if (error) {
            setFieldError(input, error);
            isValid = false;
            return;
        }

        clearFieldError(input);
    });

    return isValid;
}

function validateFieldValue(value, type, required = true) {
    if (!value) return required ? "Este campo es obligatorio." : "";

    if (type === "identifier") {
        const validEmail = VALIDATION.email.test(value);
        const validPhone = VALIDATION.phone.test(normalizePhone(value));
        return validEmail || validPhone ? "" : "Escribe un correo válido o un teléfono de 10 dígitos.";
    }

    if (type === "phone") {
        return VALIDATION.phone.test(normalizePhone(value)) ? "" : "Debe contener exactamente 10 dígitos.";
    }

    if (type === "name") {
        return VALIDATION.name.test(value) ? "" : "Usa únicamente letras, espacios y apóstrofes (2 a 40 caracteres).";
    }

    if (type === "email") {
        return VALIDATION.email.test(value) ? "" : "Escribe un correo electrónico válido.";
    }

    if (type === "password") {
        return VALIDATION.password.test(value) ? "" : "Usa al menos 8 caracteres, una letra y un número.";
    }

    return "";
}

function setFieldError(input, message) {
    const field = input.closest(".field");
    if (!field) return;

    let feedback = field.querySelector(".field-error");
    if (!feedback) {
        feedback = document.createElement("small");
        feedback.className = "field-error";
        feedback.setAttribute("role", "alert");
        input.insertAdjacentElement("afterend", feedback);
    }

    field.classList.add("has-error");
    input.classList.add("is-invalid");
    input.setAttribute("aria-invalid", "true");
    feedback.textContent = message;
}

function clearFieldError(input) {
    const field = input.closest(".field");
    const feedback = field?.querySelector(".field-error");
    field?.classList.remove("has-error");
    input.classList.remove("is-invalid");
    input.removeAttribute("aria-invalid");
    feedback?.remove();
}

async function iniciarSesion(event) {
    event.preventDefault();
    const identifier = readInputValue("login-identifier").toLowerCase();
    const password = readInputValue("login-password", false);
    const message = document.getElementById("login-message");

    const isValid = validateFormFields([
        { id: "login-identifier", type: "identifier", required: true },
        { id: "login-password", type: "password", required: true }
    ]);

    if (!isValid) {
        showMessage(message, "Revisa los campos marcados antes de continuar.");
        return;
    }

    if (identifier === ADMIN_DEMO_CREDENTIALS.email) {
        if (password !== ADMIN_DEMO_CREDENTIALS.password) {
            showMessage(message, "La contraseña no coincide.");
            return;
        }

        sessionStorage.setItem("guardian_admin_session", "active");
        window.location.href = "admin.html";
        return;
    }

    const user = getUsers().find(item =>
        String(item.email || "").toLowerCase() === identifier || normalizePhone(item.telefono) === normalizePhone(identifier)
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
    const nombres = readInputValue("register-nombres");
    const apellidoPaterno = readInputValue("register-paterno");
    const apellidoMaterno = readInputValue("register-materno");
    const phone = readInputValue("register-phone");
    const email = readInputValue("register-email").toLowerCase();
    const password = readInputValue("register-password", false);
    const confirmation = readInputValue("register-password-confirm", false);
    const message = document.getElementById("register-message");

    const isValid = validateFormFields([
        { id: "register-nombres", type: "name", required: true },
        { id: "register-paterno", type: "name", required: true },
        { id: "register-materno", type: "name", required: false },
        { id: "register-phone", type: "phone", required: true },
        { id: "register-email", type: "email", required: true },
        { id: "register-password", type: "password", required: true },
        { id: "register-password-confirm", type: "password", required: true }
    ]);

    if (!isValid) {
        showMessage(message, "Revisa los campos marcados antes de registrar el usuario.");
        return;
    }

    if (password !== confirmation) {
        setFieldError(document.getElementById("register-password-confirm"), "Las contraseñas deben coincidir.");
        showMessage(message, "La confirmación de contraseña no coincide.");
        return;
    }

    const normalizedPhone = normalizePhone(phone);

    const users = getUsers();
    const duplicate = users.some(item => String(item.email || "").toLowerCase() === email || normalizePhone(item.telefono) === normalizedPhone);
    if (duplicate) {
        showMessage(message, "Ya existe una cuenta con ese correo o teléfono.");
        return;
    }

    activeUser = createUser({
        nombres,
        apellido_paterno: apellidoPaterno,
        apellido_materno: apellidoMaterno,
        telefono: normalizedPhone,
        email,
        passwordHash: await hashPassword(password)
    });
    saveUsers([...users, activeUser]);
    saveSession();
    if (config.API_BASE_URL) await sendToApi("/usuarios", activeUser);
    document.getElementById("register-form").reset();
    showMessage(message, "");
    mostrarDashboard();
}

function mostrarDashboard() {
    document.getElementById("auth-view").classList.add("is-hidden");
    document.getElementById("dashboard-view").classList.remove("is-hidden");
    document.getElementById("dashboard-greeting").textContent = `Usuario: ${getUserFullName(activeUser)}`;
    document.getElementById("profile-initials").textContent = getInitials(getUserFullName(activeUser));
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
            if (config.API_BASE_URL) {
                sendToApi("/viajes/notificar", {
                    idViaje: currentTrip.id_viaje,
                    nombreUsuario: getUserFullName(activeUser),
                    estado: "INICIADO",
                    origen: {
                        lat: currentTrip.origen_lat,
                        lon: currentTrip.origen_lon
                    },
                    destino: currentTrip.nombre_destino,
                    etaMinutos: currentTrip.eta_original === null
                        ? null
                        : Math.ceil(currentTrip.eta_original / 60)
                }, "POST", true);
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
            if (config.API_BASE_URL) {
                sendToApi("/alertas/desvio", {
                    idViaje: currentTrip?.id_viaje || null,
                    nombreUsuario: getUserFullName(activeUser),
                    numeroDesvios: deviationCount,
                    destino: currentTrip?.nombre_destino || "Destino no disponible",
                    lat: nuevaPosicion.lat,
                    lon: nuevaPosicion.lng
                }, "POST", true);
            }
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
        if (config.API_BASE_URL) {
            sendToApi("/viajes/notificar", {
                idViaje: currentTrip.id_viaje,
                nombreUsuario: getUserFullName(activeUser),
                estado: "FINALIZADO",
                origen: {
                    lat: currentTrip.origen_lat,
                    lon: currentTrip.origen_lon
                },
                destino: currentTrip.nombre_destino,
                etaMinutos: currentTrip.eta_original === null
                    ? null
                    : Math.ceil(currentTrip.eta_original / 60)
            }, "POST", true);
        }
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

    if (config.API_BASE_URL && alert) {
        await sendToApi("/alertas/panico", {
            id_alerta: alert.id_alerta,
            idViaje: alert.id_viaje,
            nombreUsuario: getUserFullName(activeUser),
            telefonoUsuario: activeUser?.telefono || "No disponible",
            lat: alert.lat_incidente,
            lon: alert.lon_incidente,
            c5PosteId: alert.c5_poste_cercano_id,
            c5Distancia: alert.c5_distancia_metros,
            telemetriaSnapshot: alert.telemetria_snapshot
        }, "POST", true);
    }
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

async function abrirPerfil() {
    fillProfileForm();
    const modal = document.getElementById("profile-modal");
    const firstNameInput = document.getElementById("profile-nombres");
    modal?.classList.remove("is-hidden");
    firstNameInput?.focus();
    await cargarTutor();
}

async function cargarTutor() {
    const usuarioId = activeUser?.id_usuario;
    if (!usuarioId) return;

    let tutor = obtenerTutorLocal(usuarioId);
    const apiBaseUrl = getApiBaseUrl();

    if (apiBaseUrl) {
        try {
            const response = await fetch(getApiUrl(`/tutores/${encodeURIComponent(usuarioId)}`));
            if (response.ok) {
                tutor = await response.json();
                if (tutor) saveTutor(tutor);
            } else if (response.status !== 404) {
                throw new Error(`GET /tutores respondió ${response.status}`);
            }
        } catch (error) {
            console.warn("No se pudo cargar el tutor desde la API; se usa el respaldo local.", error);
        }
    }

    llenarFormularioTutor(tutor);
}

function llenarFormularioTutor(tutor) {
    setInputValue("tutor-nombre", tutor?.nombre || "");
    setInputValue("tutor-telefono", tutor?.telefono || "");
    setInputValue("tutor-parentesco", tutor?.parentesco || "");
    setInputValue("tutor-email", tutor?.email || "");
}

async function guardarTutor(event) {
    event.preventDefault();

    const message = document.getElementById("tutor-message");
    const isValid = validateFormFields([
        { id: "tutor-nombre", type: "name", required: true },
        { id: "tutor-telefono", type: "phone", required: true },
        { id: "tutor-email", type: "email", required: false }
    ]);

    if (!isValid || !activeUser?.id_usuario) {
        showMessage(message, "Revisa los campos del tutor antes de guardar.");
        return;
    }

    const tutor = {
        id_usuario: String(activeUser.id_usuario),
        nombre: readInputValue("tutor-nombre"),
        telefono: normalizePhone(readInputValue("tutor-telefono")),
        parentesco: readInputValue("tutor-parentesco") || null,
        email: readInputValue("tutor-email").toLowerCase() || null
    };

    try {
        const apiBaseUrl = getApiBaseUrl();
        if (apiBaseUrl) {
            const response = await fetch(getApiUrl(`/tutores/${encodeURIComponent(tutor.id_usuario)}`), {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(tutor)
            });

            if (!response.ok) throw new Error(`PUT /tutores respondió ${response.status}`);
            const savedTutor = await response.json();
            saveTutor(savedTutor || tutor);
        } else {
            saveTutor(tutor);
        }

        showMessage(message, "Datos del tutor guardados correctamente.");
        showToast("Datos del tutor guardados correctamente.");
    } catch (error) {
        saveTutor(tutor);
        showMessage(message, "API no disponible. Datos del tutor guardados localmente.");
        showToast("Tutor guardado en respaldo local.");
        console.warn("No se pudo guardar el tutor en la API.", error);
    }
}

function readInputValue(id, trim = true) {
    const input = document.getElementById(id);
    if (!input) return "";
    return trim ? input.value.trim() : input.value;
}

function setInputValue(id, value) {
    const input = document.getElementById(id);
    if (input) input.value = value ?? "";
}

function cerrarPerfil() {
    document.getElementById("profile-modal").classList.add("is-hidden");
}

function fillProfileForm() {
    if (!activeUser) return;
    document.getElementById("profile-nombres").value = activeUser.nombres || "";
    document.getElementById("profile-paterno").value = activeUser.apellido_paterno || "";
    document.getElementById("profile-materno").value = activeUser.apellido_materno || "";
    document.getElementById("profile-phone").value = activeUser.telefono || "";
    document.getElementById("profile-email").value = activeUser.email || "";
    document.getElementById("profile-device").value = activeUser.dispositivo_modelo || "";
}

async function guardarPerfil(event) {
    event.preventDefault();
    const message = document.getElementById("profile-message");
    const isValid = validateFormFields([
        { id: "profile-nombres", type: "name", required: true },
        { id: "profile-paterno", type: "name", required: true },
        { id: "profile-materno", type: "name", required: false },
        { id: "profile-phone", type: "phone", required: true },
        { id: "profile-email", type: "email", required: true }
    ]);

    if (!isValid) {
        showMessage(message, "Revisa los campos marcados antes de guardar.");
        return;
    }

    const updated = {
        ...activeUser,
        nombres: readInputValue("profile-nombres"),
        apellido_paterno: readInputValue("profile-paterno"),
        apellido_materno: readInputValue("profile-materno"),
        telefono: normalizePhone(readInputValue("profile-phone")),
        email: readInputValue("profile-email").toLowerCase(),
        dispositivo_modelo: readInputValue("profile-device")
    };

    const duplicate = getUsers().some(user =>
        user.id_usuario !== activeUser.id_usuario &&
        (String(user.email || "").toLowerCase() === updated.email || normalizePhone(user.telefono) === updated.telefono)
    );
    if (duplicate) {
        showMessage(message, "Ya existe otro usuario con ese correo o teléfono.");
        return;
    }

    const users = getUsers().filter(user => user.id_usuario !== activeUser.id_usuario);
    saveUsers([...users, updated]);
    activeUser = updated;
    saveSession();
    document.getElementById("dashboard-greeting").textContent = `Usuario: ${getUserFullName(activeUser)}`;
    document.getElementById("profile-initials").textContent = getInitials(getUserFullName(activeUser));
    showMessage(message, "Cambios guardados.");

    if (config.API_BASE_URL && updated.id_usuario) {
        await sendToApi(`/usuarios/${encodeURIComponent(updated.id_usuario)}`, updated, "PUT");
    }
}

async function sendToApi(path, payload, method = "POST", requireOk = false) {
    try {
        const response = await fetch(getApiUrl(path), {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        if (requireOk && !response.ok) throw new Error(`${method} ${path} respondió ${response.status}`);
        return response;
    } catch (error) {
        console.error("La API no está disponible:", error);
        return null;
    }
}

function getApiBaseUrl() {
    return String(config.API_BASE_URL || "").replace(/\/$/, "");
}

function getApiUrl(path) {
    const baseUrl = getApiBaseUrl();
    const rawPath = String(path || "");
    const apiPath = rawPath.startsWith("/api")
        ? rawPath
        : `/api${rawPath.startsWith("/") ? rawPath : `/${rawPath}`}`;

    if (baseUrl.endsWith("/api") && apiPath.startsWith("/api")) {
        return `${baseUrl}${apiPath.slice(4)}`;
    }

    return `${baseUrl}${apiPath}`;
}

function createUser(data) {
    return {
        id_usuario: data.id_usuario || createId(),
        nombres: data.nombres || "Usuario",
        apellido_paterno: data.apellido_paterno || "",
        apellido_materno: data.apellido_materno || "",
        telefono: data.telefono || "",
        email: data.email || "",
        passwordHash: data.passwordHash || "",
        dispositivo_modelo: data.dispositivo_modelo || navigator.userAgent.slice(0, 50),
        app_version: data.app_version || config.APP_VERSION,
        creado_en: data.creado_en || new Date().toISOString()
    };
}

function normalizeUser(data) {
    const legacyName = splitLegacyName(data.nombre_completo);
    return createUser({
        id_usuario: data.id_usuario,
        nombres: data.nombres || legacyName.nombres,
        apellido_paterno: data.apellido_paterno || legacyName.apellido_paterno,
        apellido_materno: data.apellido_materno || legacyName.apellido_materno,
        telefono: data.telefono,
        email: data.email,
        passwordHash: data.passwordHash,
        dispositivo_modelo: data.dispositivo_modelo,
        app_version: data.app_version,
        creado_en: data.creado_en
    });
}

function splitLegacyName(fullName) {
    const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return { nombres: "Usuario", apellido_paterno: "", apellido_materno: "" };
    if (parts.length === 1) return { nombres: parts[0], apellido_paterno: "", apellido_materno: "" };
    if (parts.length === 2) return { nombres: parts[0], apellido_paterno: parts[1], apellido_materno: "" };

    return {
        nombres: parts.slice(0, -2).join(" "),
        apellido_paterno: parts[parts.length - 2],
        apellido_materno: parts[parts.length - 1]
    };
}

function getUserFullName(user) {
    return [user?.nombres, user?.apellido_paterno, user?.apellido_materno]
        .filter(Boolean)
        .join(" ") || "Usuario";
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
    return alert;
}

function createTutor(data = {}) {
    const id = data.id || data.id_tutor || createId();
    return {
        id,
        id_usuario: data.id_usuario ? String(data.id_usuario) : null,
        nombre: data.nombre || data.nombre_completo || "",
        telefono: data.telefono || "",
        parentesco: data.parentesco || data.relacion || "",
        email: data.email || null,
        permisos: Array.isArray(data.permisos) ? data.permisos : []
    };
}

function getTutors() {
    return readJson(STORAGE.tutors, [])
        .map(createTutor)
        .filter(tutor => !tutor.id_usuario || tutor.id_usuario === String(activeUser?.id_usuario));
}

function saveTutor(tutor) {
    const normalized = createTutor({
        ...tutor,
        id_usuario: tutor.id_usuario || activeUser?.id_usuario
    });
    const stored = readJson(STORAGE.tutors, []);
    const otherUsersTutors = stored.filter(item => String(item.id_usuario || "") !== normalized.id_usuario);
    const currentUserTutors = getTutors().filter(item => item.id !== normalized.id);
    localStorage.setItem(STORAGE.tutors, JSON.stringify([...otherUsersTutors, ...currentUserTutors, normalized]));
}

function obtenerTutorLocal(usuarioId) {
    return getTutors().find(tutor => tutor.id_usuario === String(usuarioId)) || null;
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
    return readJson(STORAGE.users, []).map(normalizeUser);
}

function saveUsers(users) {
    localStorage.setItem(STORAGE.users, JSON.stringify(users.map(normalizeUser)));
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
    if (element) element.textContent = message;
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
