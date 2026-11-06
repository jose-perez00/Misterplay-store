
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
            accept: ".apk,application/vnd.android.package-archive",
            ayuda: "Selecciona un archivo APK. Máximo 100 MB."
        },
        html: {
            accept: ".html,.htm,.zip,text/html,application/zip,application/x-zip-compressed",
            ayuda: "Selecciona un archivo HTML o un ZIP con index.html y sus recursos. Máximo 100 MB."
        },
        web: {
            accept: ".zip,application/zip,application/x-zip-compressed",
            ayuda: "Sube un ZIP con index.html en la raíz y todos los recursos del sitio. Máximo 100 MB."
        }
    };

    const formato = formatos[tipoProyecto.value];

    archivoProyecto.accept = formato.accept;
    $("ayudaArchivo").textContent = formato.ayuda;

    if(archivoProyecto.value)
        archivoProyecto.value = "";
}

tipoProyecto.addEventListener("change", actualizarFormatoArchivo);
actualizarFormatoArchivo();

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

        if(archivo.size > 100 * 1024 * 1024)
            throw Error("El archivo supera 100 MB.");

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

        const subida = await db.storage
        .from("store-files")
        .upload(rutaArchivo,archivo);

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

        const {error} = await db.from("projects").insert({

            owner_id: usuario.id,
            title: datos.get("titulo"),
            type: tipo,
            description: datos.get("descripcion"),
            file_path: rutaArchivo,
            cover_url: imagen,
            status: administrador ? "approved" : "pending"

        });

        if(error) throw error;

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

        $("mensaje").textContent = error.message || "No se pudo publicar el proyecto.";

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
