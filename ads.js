const config = window.MP_CONFIG;

if (config?.ADSENSE_CLIENT &&
    /^ca-pub-\d+$/.test(config.ADSENSE_CLIENT)) {

    const script = document.createElement("script");
    script.async = true;
    script.crossOrigin = "anonymous";
    script.src =
        "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" +
        encodeURIComponent(config.ADSENSE_CLIENT);
    document.head.appendChild(script);

    const espacio = document.querySelector("#homeAd, #downloadAd");

    if (espacio && config.ADSENSE_SLOT &&
        /^\d+$/.test(config.ADSENSE_SLOT) &&
        config.ADSENSE_SLOT !== "0000000000") {

        const anuncio = document.createElement("ins");
        anuncio.className = "adsbygoogle";
        anuncio.style.display = "block";
        anuncio.dataset.adClient = config.ADSENSE_CLIENT;
        anuncio.dataset.adSlot = config.ADSENSE_SLOT;
        anuncio.dataset.adFormat = "auto";
        anuncio.dataset.fullWidthResponsive = "true";

        espacio.replaceChildren(anuncio);

        try {
            (window.adsbygoogle = window.adsbygoogle || []).push({});
        } catch(error) {
            console.error("No se pudo inicializar el anuncio.", error);
        }
    }
}
