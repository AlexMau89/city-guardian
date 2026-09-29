// Verificar si hay sesión activa al cargar la app
document.addEventListener("DOMContentLoaded", () => {
    const usuarioGuardado = localStorage.getItem("cg_usuario");
    if (usuarioGuardado) {
        mostrarDashboard(usuarioGuardado);
    }
});

function iniciarSesion(event) {
    event.preventDefault(); // Evita recargar la página

    const usuario = document.getElementById("usuario").value;
    const password = document.getElementById("password").value;

    // Validación local (sustituir posteriormente por llamada a tu API Backend)
    if (usuario.trim() !== "" && password.trim() !== "") {
        localStorage.setItem("cg_usuario", usuario);
        mostrarDashboard(usuario);
    } else {
        alert("Por favor completa las credenciales.");
    }
}

function mostrarDashboard(usuario) {
    document.getElementById("login-view").classList.add("hidden");
    document.getElementById("dashboard-view").classList.remove("hidden");
    document.getElementById("bienvenida-text").textContent = `Hola, ${usuario} 👋`;
    document.getElementById("mensaje").textContent = "";
}

function cerrarSesion() {
    localStorage.removeItem("cg_usuario");
    document.getElementById("login-form").reset();
    document.getElementById("dashboard-view").classList.add("hidden");
    document.getElementById("login-view").classList.remove("hidden");
    document.getElementById("mensaje").textContent = "";
}

function mostrarMensaje() {
    document.getElementById("mensaje").textContent =
        "🟢 ¡Rastreo y telemetría de ruta iniciados!";
}

function emergencia() {
    document.getElementById("mensaje").textContent =
        "🚨 Evento de emergencia emitido a la central";
}