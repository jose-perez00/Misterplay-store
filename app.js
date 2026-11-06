
(function() {

"use strict";

const config = window.MP_CONFIG;

if (!window.supabase) {

    const aviso = document.getElementById("proyectos");

    if (aviso) {
        aviso.textContent =
        "Error: no se pudo cargar la librería de Supabase. Revisa tu conexión o desactiva el bloqueador de anuncios.";
        aviso.style.color = "#ff7b7b";
    }

    return;
}

const db = window.supabase.createClient(
    config.SUPABASE_URL,
    config.SUPABASE_ANON_KEY
);

let usuario = null;
let administrador = false;
let proyectos = [];
let filtro = "all";

const $ = id => document.getElementById(id);

function escapar(texto = "") {
    return String(texto).replace(/[&<>"']/g, c => ({
        "&":"&amp;",
        "<":"&lt;",
        ">":"&gt;",
        '"':"&quot;",
        "'":"&#39;"
    }[c]));
}

// SESIÓN
async function verificarUsuario() {

    const {data} = await db.auth.getSession();

    usuario = data.session?.user || null;

    $("loginBtn").hidden = !!usuario;
    $("logoutBtn").hidden = !usuario;

    $("formProyecto").hidden = !usuario;
    $("mensajeLogin").hidden = !!usuario;

    if(usuario) {

        const {data: perfil} = await db
        .from("profiles")
        .select("role")
        .eq("id",usuario.id)
        .maybeSingle();

        administrador = perfil?.role === "admin";

        $("administracion").hidden = !administrador;

        if(administrador) cargarEstadisticas();
    }
}

// CARGAR PROYECTOS
async function cargarProyectos() {

    const {data,error} = await db
    .from("projects")
    .select("*")
    .eq("status","approved")
    .order("created_at",{ascending:false});

    if(error) {
        $("proyectos").textContent = error.message;
        return;
    }

    proyectos = data || [];

    mostrarProyectos();
}

// MOSTRAR TARJETAS
function mostrarProyectos() {

    const busqueda =
    $("buscador").value.toLowerCase();

    const lista = proyectos.filter(p => {

        const coincideTipo =
        filtro === "all" || p.type === filtro;

        const coincideTexto =
        (p.title + " " + p.description)
        .toLowerCase().includes(busqueda);

        return coincideTipo && coincideTexto;
    });

    $("proyectos").innerHTML = lista.map(p => `

        <article class="card">

            ${p.cover_url
                ? `<img src="${escapar(p.cover_url)}" alt="Portada de ${escapar(p.title)}">`
                : `<div class="ad-box">${escapar(p.type.toUpperCase())}</div>`
            }

            <h3>${escapar(p.title)}</h3>

            <p>${escapar(p.description)}</p>

            <p>Descargas: ${Number(p.download_count || 0)}</p>

            <a class="btn"
            href="descargas.html?id=${encodeURIComponent(p.id)}">
            VER DESCARGA
            </a>

        </article>

    `).join("") || "<p>No hay proyectos disponibles.</p>";
}

// FILTROS
document.querySelectorAll("[data-filter]").forEach(btn => {

    btn.addEventListener("click",() => {

        filtro = btn.dataset.filter;

        mostrarProyectos();

    });

});

$("buscador").addEventListener("input",mostrarProyectos);

const tipoProyecto = $("tipoProyecto");
const archivoProyecto = $("archivoProyecto");

function actualizarFormatoArchivo() {

    const formatos = {
        apk: {
            // Sin filtro estricto: algunos selectores de Android ocultan
            // las APK cuando se limita por tipo. Se valida la extensión al enviar.
            accept: "",
            ayuda: "Selecciona un archivo APK. Máximo 50 MB."
        },
        html: {
            accept: ".html,.htm,.zip,text/html,application/zip,application/x-zip-compressed",
            ayuda: "Selecciona un archivo HTML o un ZIP con index.html y sus recursos. Máximo 50 MB."
        },
        web: {
            accept: ".zip,application/zip,application/x-zip-compressed",
            ayuda: "Sube un ZIP con index.html en la raíz y todos los recursos del sitio. Máximo 50 MB."
        }
    };

    const formato = formatos[tipoProyecto.value];

    if(formato.accept) archivoProyecto.accept = formato.accept;
    else archivoProyecto.removeAttribute("accept");
    $("ayudaArchivo").textContent = formato.ayuda;

    if(archivoProyecto.value)
        archivoProyecto.value = "";
}

tipoProyecto.addEventListener("change", actualizarFormatoArchivo);
actualizarFormatoArchivo();

const LIMITE_ARCHIVO = 50 * 1024 * 1024;

const TIPOS_MIME = {
    ".apk": "application/vnd.android.package-archive",
    ".zip": "application/zip",
    ".html": "text/html",
    ".htm": "text/html"
};

function mensajeError(error) {
    const texto = String(error?.message || "");
    const codigo = String(error?.statusCode || error?.status || "");

    if(codigo === "413" || /maximum allowed size|too large/i.test(texto))
        return "El archivo es demasiado grande. El máximo es 50 MB.";

    if(codigo === "415" || /mime type/i.test(texto))
        return "El tipo de archivo no está permitido.";

    if(/row-level security|unauthorized/i.test(texto))
        return "No tienes permiso para subir archivos. Cierra sesión y vuelve a entrar.";

    if(/failed to fetch|network/i.test(texto))
        return "Error de conexión durante la subida. Revisa tu internet e inténtalo de nuevo.";

    return texto || "No se pudo publicar el proyecto.";
}

// PUBLICAR PROYECTO
$("formProyecto").addEventListener("submit",async e => {

    e.preventDefault();

    const form = e.currentTarget;
    const datos = new FormData(form);

    const archivo = datos.get("archivo");
    const portada = datos.get("portada");
    const tipo = datos.get("tipo");
    const extensionesPermitidas = {
        apk: [".apk"],
        html: [".html", ".htm", ".zip"],
        web: [".zip"]
    };
    const boton = form.querySelector('button[type="submit"]');
    let rutaArchivo = null;
    let rutaImagen = null;

    try {

        if(!usuario)
            throw Error("Inicia sesión para publicar un proyecto.");

        if(!archivo || !archivo.size)
            throw Error("Selecciona un archivo.");

        if(archivo.size > LIMITE_ARCHIVO)
            throw Error("El archivo supera el máximo de 50 MB.");

        const nombreArchivo = archivo.name.toLowerCase();
        const extensionValida = extensionesPermitidas[tipo]?.some(
            extension => nombreArchivo.endsWith(extension)
        );

        if(!extensionValida)
            throw Error("El formato del archivo no corresponde al tipo de proyecto.");

        if(portada && portada.size) {
            if(!/^image\/(png|jpeg|webp)$/.test(portada.type))
                throw Error("La portada debe ser PNG, JPG o WEBP.");

            if(portada.size > 5 * 1024 * 1024)
                throw Error("La portada supera 5 MB.");
        }

        boton.disabled = true;
        $("mensaje").textContent = "Subiendo proyecto...";

        rutaArchivo =
        usuario.id + "/" + crypto.randomUUID() + "-" +
        archivo.name.replace(/[^a-zA-Z0-9._-]/g,"_");

        // El navegador no siempre reporta el tipo correcto de una APK
        // (a veces vacío o desconocido) y el almacenamiento lo rechaza.
        // Se fija el tipo según la extensión.
        const extension = nombreArchivo.slice(nombreArchivo.lastIndexOf("."));
        const archivoSubida = new File(
            [archivo],
            archivo.name,
            {type: TIPOS_MIME[extension] || "application/octet-stream"}
        );

        const subida = await db.storage
        .from("store-files")
        .upload(rutaArchivo,archivoSubida,{
            contentType: archivoSubida.type
        });

        if(subida.error) throw subida.error;

        let imagen = null;

        if(portada && portada.size) {

            rutaImagen =
            usuario.id + "/" + crypto.randomUUID() + "-" +
            portada.name.replace(/[^a-zA-Z0-9._-]/g,"_");

            const subirImagen = await db.storage
            .from("store-images")
            .upload(rutaImagen,portada);

            if(subirImagen.error) throw subirImagen.error;

            imagen = db.storage
            .from("store-images")
            .getPublicUrl(rutaImagen).data.publicUrl;
        }

        // Las reglas de la base de datos solo permiten crear proyectos
        // como "pending". Si eres administrador, se aprueba justo después.
        const {data: nuevo, error} = await db.from("projects").insert({

            owner_id: usuario.id,
            title: datos.get("titulo"),
            type: tipo,
            description: datos.get("descripcion"),
            file_path: rutaArchivo,
            cover_url: imagen,
            status: "pending"

        }).select("id").single();

        if(error) throw error;

        // El proyecto ya existe: no borrar sus archivos si falla la aprobación.
        rutaArchivo = null;
        rutaImagen = null;

        if(administrador) {
            const {error: errorAprobar} = await db.from("projects")
            .update({status: "approved"})
            .eq("id", nuevo.id);

            if(errorAprobar)
                throw Error("Proyecto guardado, pero no se pudo aprobar. Apruébalo desde el panel administrador.");

            cargarEstadisticas();
        }

        $("mensaje").textContent = administrador
        ? "¡Proyecto publicado en el catálogo!"
        : "Proyecto enviado para revisión.";

        if(administrador) cargarProyectos();

        form.reset();
        actualizarFormatoArchivo();

    } catch(error) {

        const archivosHuerfanos = [];

        if(rutaImagen) {
            const {error: errorImagen} = await db.storage
                .from("store-images")
                .remove([rutaImagen]);

            if(errorImagen) archivosHuerfanos.push(errorImagen.message);
        }

        if(rutaArchivo) {
            const {error: errorArchivo} = await db.storage
                .from("store-files")
                .remove([rutaArchivo]);

            if(errorArchivo) archivosHuerfanos.push(errorArchivo.message);
        }

        $("mensaje").textContent = mensajeError(error);

        if(archivosHuerfanos.length)
            console.error("No se pudieron eliminar archivos de una publicación fallida.", archivosHuerfanos);
    } finally {
        boton.disabled = false;
    }

});

// INICIO DE SESIÓN
$("loginBtn").onclick = () => $("loginDialog").showModal();

$("cerrarLogin").onclick = () => $("loginDialog").close();

$("formLogin").addEventListener("submit",async e => {

    e.preventDefault();

    const datos = new FormData(e.currentTarget);

    const {error} = await db.auth.signInWithPassword({

        email: datos.get("email"),
        password: datos.get("password")

    });

    $("estadoLogin").textContent =
    error ? error.message : "Sesión iniciada.";

    if(!error) {

        await verificarUsuario();
        $("loginDialog").close();

    }

});

// REGISTRO
$("registroBtn").onclick = async () => {

    const datos = new FormData($("formLogin"));

    const {error} = await db.auth.signUp({

        email: datos.get("email"),
        password: datos.get("password")

    });

    $("estadoLogin").textContent =
    error ? error.message :
    "Revisa tu correo para confirmar el registro.";

};

// SALIR
$("logoutBtn").onclick = async () => {

    await db.auth.signOut();

    location.reload();

};

// ADMINISTRADOR
async function cargarEstadisticas() {

    const {data,error} =
    await db.rpc("admin_dashboard_stats");

    if(error) {
        console.error(error);
        return;
    }

    $("totalProyectos").textContent = data.projects;
    $("totalDescargas").textContent = data.downloads;
    $("pendientes").textContent = data.pending;

    const {data:pendientes} = await db
    .from("projects")
    .select("*")
    .eq("status","pending");

    $("listaPendientes").innerHTML =
    (pendientes || []).map(p => `

        <div class="card">

            <h3>${escapar(p.title)}</h3>

            <button onclick="aprobar('${p.id}')">
                APROBAR
            </button>

            <button onclick="rechazar('${p.id}')">
                RECHAZAR
            </button>

        </div>

    `).join("");
}

window.aprobar = async id => {

    if(!administrador) return;

    await db.from("projects")
    .update({status:"approved"})
    .eq("id",id);

    cargarEstadisticas();
    cargarProyectos();

};

window.rechazar = async id => {

    if(!administrador) return;

    await db.from("projects")
    .update({status:"rejected"})
    .eq("id",id);

    cargarEstadisticas();

};

db.auth.onAuthStateChange(() => {
    verificarUsuario();
});

(async function iniciar() {

    await verificarUsuario();

    await cargarProyectos();

})();

})();
