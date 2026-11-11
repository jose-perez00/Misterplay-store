
const config = window.MP_CONFIG;

const db = window.supabase.createClient(
    config.SUPABASE_URL,
    config.SUPABASE_ANON_KEY
);

const id = new URLSearchParams(location.search).get("id");

let proyecto = null;

async function iniciar() {

    if(!id) return;

    const {data,error} = await db
    .from("projects")
    .select("*")
    .eq("id",id)
    .eq("status","approved")
    .maybeSingle();

    if(error || !data) {

        document.getElementById("titulo").textContent =
        "PROYECTO NO DISPONIBLE";

        return;
    }

    proyecto = data;

    document.getElementById("titulo").textContent =
    proyecto.title;

    document.getElementById("descripcion").textContent =
    proyecto.description;

    document.getElementById("contador").textContent =
    "Descargas: " + proyecto.download_count;

    document.getElementById("descargar").disabled = false;

    document.getElementById("descargar").textContent =
    "DESCARGAR AHORA";

}

document.getElementById("descargar").onclick = async () => {

    if(!proyecto) return;

    const boton = document.getElementById("descargar");

    boton.disabled = true;
    document.getElementById("estado").textContent =
        "Preparando archivo...";

    try {
        const respuesta = await fetch(
            "/.netlify/functions/download",
            {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({projectId: proyecto.id})
            }
        );

        const resultado = await respuesta.json();

        if(!respuesta.ok)
            throw Error(resultado.error || "Error de descarga.");

        if(!resultado.url)
            throw Error("El servidor no devolvió el enlace de descarga.");

        const enlace = document.createElement("a");
        enlace.href = resultado.url;
        enlace.rel = "noopener";
        enlace.download = "";

        document.body.appendChild(enlace);
        enlace.click();
        enlace.remove();

        document.getElementById("estado").textContent =
            "La descarga está comenzando.";
    } catch(error) {
        document.getElementById("estado").textContent = error.message;
    } finally {
        boton.disabled = false;
    }
};

iniciar();
