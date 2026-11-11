(function () {
  "use strict";

  const config = window.MP_CONFIG;

  if (!window.supabase || !config?.SUPABASE_URL || !config?.SUPABASE_ANON_KEY) {
    const area = document.getElementById("proyectos");
    if (area) area.textContent = "No se pudo conectar con Supabase. Revisa config.js.";
    return;
  }

  const db = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
  const $ = id => document.getElementById(id);

  let usuario = null;
  let administrador = false;
  let proyectos = [];
  let filtro = "all";

  function escapar(valor = "") {
    return String(valor).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;",
      '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function mensaje(texto, color) {
    const elemento = $("mensaje");
    if (!elemento) return;
    elemento.textContent = texto;
    if (color) elemento.style.color = color;
  }

  async function verificarUsuario() {
    const { data, error } = await db.auth.getSession();
    if (error) { console.error(error); return; }

    usuario = data.session?.user || null;
    administrador = false;

    if ($("loginBtn")) $("loginBtn").hidden = !!usuario;
    if ($("logoutBtn")) $("logoutBtn").hidden = !usuario;
    if ($("administracion")) $("administracion").hidden = true;
    if ($("formProyecto")) $("formProyecto").hidden = true;

    if (!usuario) {
      if ($("mensajeLogin")) {
        $("mensajeLogin").textContent = "Inicia sesión para acceder a tu cuenta.";
        $("mensajeLogin").hidden = false;
      }
      return;
    }

    if ($("mensajeLogin")) $("mensajeLogin").hidden = true;

    const { data: perfil, error: perfilError } = await db
      .from("profiles").select("role").eq("id", usuario.id).maybeSingle();

    if (perfilError) { console.error("No se pudo consultar el perfil:", perfilError); return; }

    administrador = perfil?.role === "admin";

    if (administrador) {
      if ($("administracion")) $("administracion").hidden = false;
      if ($("formProyecto")) $("formProyecto").hidden = false;
      await cargarEstadisticas();
    }
  }

  async function cargarProyectos() {
    const contenedor = $("proyectos");
    if (!contenedor) return;
    contenedor.innerHTML = '<div class="loading-card">Cargando proyectos...</div>';

    const { data, error } = await db
      .from("projects").select("*")
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .range(0, 49);

    if (error) {
      console.error(error);
      contenedor.textContent = "No se pudo cargar el catálogo: " + error.message;
      return;
    }
    proyectos = data || [];
    mostrarProyectos();
  }

  function mostrarProyectos() {
    const contenedor = $("proyectos");
    if (!contenedor) return;
    const busqueda = $("buscador") ? $("buscador").value.trim().toLowerCase() : "";

    const lista = proyectos.filter(p => {
      const tipo = filtro === "all" || p.type === filtro;
      const texto = `${p.title || ""} ${p.description || ""}`.toLowerCase();
      return tipo && texto.includes(busqueda);
    });

    if (!lista.length) {
      contenedor.innerHTML = '<div class="loading-card">No encontramos proyectos en esta categoría.</div>';
      return;
    }

    contenedor.innerHTML = lista.map(p => {
      const imagen = p.cover_url
        ? `<img src="${escapar(p.cover_url)}" alt="Portada de ${escapar(p.title)}" loading="lazy">`
        : `<div class="project-placeholder">${escapar((p.type || "MP").toUpperCase())}</div>`;
      return `
        <article class="card">
          ${imagen}
          <h3>${escapar(p.title)}</h3>
          <p>${escapar(p.description || "Proyecto digital MISTERPLAY.")}</p>
          <p>Tipo: ${escapar((p.type || "").toUpperCase())}</p>
          <p>Descargas: ${Number(p.download_count || 0)}</p>
          <a class="btn-primary" href="descargas.html?id=${encodeURIComponent(p.id)}">VER PROYECTO ↗</a>
        </article>`;
    }).join("");
  }

  document.querySelectorAll("[data-filter]").forEach(boton => {
    boton.addEventListener("click", () => {
      filtro = boton.dataset.filter;
      document.querySelectorAll("[data-filter]").forEach(b => b.classList.toggle("active", b === boton));
      mostrarProyectos();
    });
  });

  if ($("buscador")) $("buscador").addEventListener("input", mostrarProyectos);

  const tipoProyecto = $("tipoProyecto");
  const archivoProyecto = $("archivoProyecto");

  function actualizarFormatoArchivo() {
    if (!tipoProyecto || !archivoProyecto) return;
    const formatos = {
      apk: { accept: ".apk,application/vnd.android.package-archive", ayuda: "Selecciona un archivo APK. Máximo 100 MB." },
      html: { accept: ".html,.htm,.zip,text/html,application/zip,application/x-zip-compressed", ayuda: "Selecciona un HTML o ZIP con index.html y sus recursos. Máximo 100 MB." },
      web: { accept: ".zip,application/zip,application/x-zip-compressed", ayuda: "Sube un ZIP que contenga index.html y los recursos del sitio. Máximo 100 MB." }
    };
    const formato = formatos[tipoProyecto.value];
    if (!formato) return;
    archivoProyecto.accept = formato.accept;
    if ($("ayudaArchivo")) $("ayudaArchivo").textContent = formato.ayuda;
    archivoProyecto.value = "";
  }

  if (tipoProyecto) tipoProyecto.addEventListener("change", actualizarFormatoArchivo);
  actualizarFormatoArchivo();

  const formProyecto = $("formProyecto");
  if (formProyecto) {
    formProyecto.addEventListener("submit", async e => {
      e.preventDefault();
      if (!usuario || !administrador) { mensaje("No tienes permiso para publicar proyectos.", "#ff7b91"); return; }

      const form = e.currentTarget;
      const datos = new FormData(form);
      const archivo = datos.get("archivo");
      const portada = datos.get("portada");
      const tipo = datos.get("tipo");
      const titulo = String(datos.get("titulo") || "").trim();
      const descripcion = String(datos.get("descripcion") || "").trim();
      const boton = form.querySelector('button[type="submit"]');

      const extensiones = { apk: [".apk"], html: [".html", ".htm", ".zip"], web: [".zip"] };
      let rutaArchivo = null;
      let rutaImagen = null;

      try {
        if (!titulo) throw Error("Escribe un título para el proyecto.");
        if (titulo.length < 3) throw Error("El título debe tener al menos 3 caracteres.");
        if (!descripcion) throw Error("Escribe una descripción para el proyecto.");
        if (!extensiones[tipo]) throw Error("Selecciona un tipo de proyecto válido.");
        if (!archivo || !archivo.size) throw Error("Selecciona un archivo.");
        if (archivo.size > 100 * 1024 * 1024) throw Error("El archivo supera 100 MB.");

        const nombre = archivo.name.toLowerCase();
        if (!extensiones[tipo]?.some(ext => nombre.endsWith(ext))) throw Error("El archivo no corresponde al tipo seleccionado.");

        if (portada && portada.size) {
          if (!/^image\/(png|jpeg|webp)$/.test(portada.type)) throw Error("La portada debe ser PNG, JPG o WEBP.");
          if (portada.size > 5 * 1024 * 1024) throw Error("La portada supera 5 MB.");
        }

        if (boton) boton.disabled = true;
        mensaje("Subiendo proyecto...");

        const nombreSeguro = archivo.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        rutaArchivo = `${usuario.id}/${crypto.randomUUID()}-${nombreSeguro}`;
        const subida = await db.storage.from("store-files").upload(rutaArchivo, archivo);
        if (subida.error) throw subida.error;

        let imagen = null;
        if (portada && portada.size) {
          const portadaSegura = portada.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          rutaImagen = `${usuario.id}/${crypto.randomUUID()}-${portadaSegura}`;
          const subidaImagen = await db.storage.from("store-images").upload(rutaImagen, portada);
          if (subidaImagen.error) throw subidaImagen.error;
          imagen = db.storage.from("store-images").getPublicUrl(rutaImagen).data.publicUrl;
        }

        const { error } = await db.from("projects").insert({
          owner_id: usuario.id,
          title: titulo,
          type: tipo,
          description: descripcion,
          file_path: rutaArchivo,
          cover_url: imagen,
          status: "pending"
        });
        if (error) throw error;

        mensaje("¡Proyecto enviado a revisión! Aparecerá cuando lo apruebes.");
        form.reset();
        actualizarFormatoArchivo();
        await cargarProyectos();
        await cargarEstadisticas();
      } catch (error) {
        console.error(error);
        if (rutaImagen) await db.storage.from("store-images").remove([rutaImagen]);
        if (rutaArchivo) await db.storage.from("store-files").remove([rutaArchivo]);
        mensaje(error.message || "No se pudo publicar el proyecto.", "#ff8299");
      } finally {
        if (boton) boton.disabled = false;
      }
    });
  }

  async function cargarEstadisticas() {
    if (!administrador) return;
    const { data, error } = await db.rpc("admin_dashboard_stats");
    if (error) { console.error("Error en estadísticas:", error); return; }

    const stats = Array.isArray(data) ? data[0] : data;
    if (!stats) return;

    if ($("totalProyectos")) $("totalProyectos").textContent = stats.projects ?? 0;
    if ($("totalDescargas")) $("totalDescargas").textContent = stats.downloads ?? 0;
    if ($("pendientes")) $("pendientes").textContent = stats.pending ?? 0;

    const listaPendientes = $("listaPendientes");
    if (!listaPendientes) return;

    const { data: pendientes, error: errorPendientes } = await db
      .from("projects").select("id,title,description,type")
      .eq("status", "pending").order("created_at", { ascending: false });

    if (errorPendientes) { listaPendientes.textContent = errorPendientes.message; return; }

    listaPendientes.innerHTML = (pendientes || []).map(p => `
      <article class="card">
        <h3>${escapar(p.title)}</h3>
        <p>${escapar(p.description || "")}</p>
        <p>Tipo: ${escapar(p.type || "")}</p>
        <div class="pending-actions">
          <button class="approve-button" data-approve="${escapar(p.id)}">APROBAR</button>
          <button class="reject-button" data-reject="${escapar(p.id)}">RECHAZAR</button>
        </div>
      </article>`).join("") || "<p>No hay proyectos pendientes.</p>";
  }

  const listaPendientesEl = $("listaPendientes");
  if (listaPendientesEl) {
    listaPendientesEl.addEventListener("click", async e => {
      if (!administrador) return;
      const aprobarId = e.target.dataset.approve;
      const rechazarId = e.target.dataset.reject;
      const id = aprobarId || rechazarId;
      if (!id) return;
      const nuevoEstado = aprobarId ? "approved" : "rejected";
      const { error } = await db.from("projects").update({ status: nuevoEstado }).eq("id", id);
      if (error) { alert("No se pudo actualizar: " + error.message); return; }
      await cargarEstadisticas();
      await cargarProyectos();
    });
  }

  if ($("loginBtn")) $("loginBtn").addEventListener("click", () => $("loginDialog")?.showModal());
  if ($("cerrarLogin")) $("cerrarLogin").addEventListener("click", () => $("loginDialog")?.close());

  const formLogin = $("formLogin");
  if (formLogin) {
    formLogin.addEventListener("submit", async e => {
      e.preventDefault();
      const datos = new FormData(e.currentTarget);
      const { error } = await db.auth.signInWithPassword({ email: datos.get("email"), password: datos.get("password") });
      if ($("estadoLogin")) $("estadoLogin").textContent = error ? error.message : "Sesión iniciada correctamente.";
      if (!error) { $("loginDialog")?.close(); await verificarUsuario(); await cargarProyectos(); }
    });
  }

  if ($("registroBtn")) {
    $("registroBtn").addEventListener("click", async () => {
      const datos = new FormData($("formLogin"));
      const email = datos.get("email");
      const password = datos.get("password");
      if (!email || !password || password.length < 8) {
        if ($("estadoLogin")) $("estadoLogin").textContent = "Escribe tu correo y una contraseña de al menos 8 caracteres.";
        return;
      }
      const { error } = await db.auth.signUp({ email, password });
      if ($("estadoLogin")) $("estadoLogin").textContent = error ? error.message : "Registro enviado. Revisa tu correo para confirmar la cuenta.";
    });
  }

  if ($("logoutBtn")) $("logoutBtn").addEventListener("click", async () => { await db.auth.signOut(); location.reload(); });

  db.auth.onAuthStateChange(() => {
    setTimeout(async () => { await verificarUsuario(); await cargarProyectos(); }, 0);
  });

  (async function iniciar() {
    await verificarUsuario();
    await cargarProyectos();
  })();
})();
