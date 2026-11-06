export default async function run(page, ui) {
  // Inyectar antes de que cargue la página: capturar TODOS los errores JS
  // y escribirlos en un atributo del DOM (visible desde cualquier contexto)
  await page.addInitScript(() => {
    window.__errores = [];
    window.addEventListener("error", e => {
      window.__errores.push(e.message + " @ " + (e.filename || "") + ":" + e.lineno);
      document.documentElement.setAttribute("data-errores", window.__errores.join(" ||| "));
    });
    window.addEventListener("unhandledrejection", e => {
      window.__errores.push("promise: " + (e.reason?.message || e.reason));
      document.documentElement.setAttribute("data-errores", window.__errores.join(" ||| "));
    });
  });

  await page.goto("https://misterplay-store.netlify.app/", { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);

  // Leer el estado REAL de la página a través del DOM
  const estado = await page.evaluate(() => {
    const d = document.getElementById("loginDialog");
    // Intentar abrir el diálogo como lo haría app.js
    const btn = document.getElementById("loginBtn");
    if (btn) btn.click();
    return {
      errores: document.documentElement.getAttribute("data-errores") || "(ninguno)",
      dialogoAbreTrasClick: d ? d.open : "sin dialogo",
      catalogo: document.getElementById("proyectos")?.textContent.trim().slice(0, 80)
    };
  });

  await page.screenshot({ path: "C:/Users/josej/Desktop/Mi Web/diag.png" });
  return estado;
}
