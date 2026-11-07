
/* ======================================
   MISTERPLAY MUSIC
   Radio: Radio Browser
====================================== */

// 1. CONFIGURACIÓN
const RADIO_API = "https://de1.api.radio-browser.info/json";
const LOCAL_MUSIC_DB_NAME = "misterplay-local-music";
const LOCAL_MUSIC_STORE = "files";

if (new URLSearchParams(location.search).get("integrado") === "1") {
  document.body.classList.add("embedded-player");
}

const radioList = document.getElementById("radioList");
const radioStatus = document.getElementById("radioStatus");
const localList = document.getElementById("localList");
const localStatus = document.getElementById("localStatus");
const localFilesInput = document.getElementById("localFiles");
const localDropZone = document.getElementById("localDropZone");
const videoFilesInput = document.getElementById("videoFiles");
const videoDropZone = document.getElementById("videoDropZone");
const videoList = document.getElementById("videoList");
const videoStatus = document.getElementById("videoStatus");
const videoPlaybackScreen = document.getElementById("videoPlaybackScreen");
const localVideoPlayer = document.getElementById("localVideoPlayer");
const audio = document.getElementById("audioPlayer");
const player = document.getElementById("player");
const playerCover = document.getElementById("playerCover");
const playbackScreen = document.getElementById("playbackScreen");
const playbackCover = document.getElementById("playbackCover");
const playbackProgress = document.getElementById("playbackProgress");
const playbackVolume = document.getElementById("playbackVolume");
const mediaSession = "mediaSession" in navigator
  ? navigator.mediaSession
  : null;

let playlist = [];
let currentIndex = -1;
let shuffleLocalPlayback = false;
const localCoverUrls = new Set();
const localCovers = new Map();
let localTracks = [];
let localVideos = [];
let currentTrack = null;
let currentVideoId = "";
let activeRadio = false;
let radioStations = [];
let currentRadioIndex = -1;
let radioSearchId = 0;
let localMusicDbPromise;

function openLocalMusicDatabase() {
  if (!("indexedDB" in window)) {
    return Promise.reject(new Error("Este navegador no permite guardar música local."));
  }
  if (localMusicDbPromise) return localMusicDbPromise;

  localMusicDbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(LOCAL_MUSIC_DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(LOCAL_MUSIC_STORE)) {
        request.result.createObjectStore(LOCAL_MUSIC_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(
      request.error || new Error("No se pudo abrir la biblioteca local.")
    );
  });
  return localMusicDbPromise;
}

async function saveLocalMusicRecord(record) {
  const database = await openLocalMusicDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(LOCAL_MUSIC_STORE, "readwrite");
    transaction.objectStore(LOCAL_MUSIC_STORE).put(record);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(
      transaction.error || new Error("No se pudo guardar la música local.")
    );
    transaction.onabort = () => reject(
      transaction.error || new Error("Se canceló el guardado de música local.")
    );
  });
}

async function saveLocalMusicRecords(records) {
  const database = await openLocalMusicDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(LOCAL_MUSIC_STORE, "readwrite");
    const store = transaction.objectStore(LOCAL_MUSIC_STORE);
    try {
      records.forEach(record => store.put(record));
    } catch (error) {
      transaction.abort();
      reject(error);
      return;
    }
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(
      transaction.error || new Error("No se pudieron guardar todas las canciones.")
    );
    transaction.onabort = () => reject(
      transaction.error || new Error("Se canceló la carga de las canciones.")
    );
  });
}

async function readLocalMusicRecords() {
  const database = await openLocalMusicDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(LOCAL_MUSIC_STORE, "readonly");
    const request = transaction.objectStore(LOCAL_MUSIC_STORE).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(
      request.error || new Error("No se pudo leer la biblioteca local.")
    );
  });
}

async function deleteLocalMediaRecord(id) {
  const database = await openLocalMusicDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(LOCAL_MUSIC_STORE, "readwrite");
    transaction.objectStore(LOCAL_MUSIC_STORE).delete(id);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(
      transaction.error || new Error("No se pudo borrar el archivo local.")
    );
    transaction.onabort = () => reject(
      transaction.error || new Error("Se canceló el borrado del archivo local.")
    );
  });
}
function playTrack(index) {
  const track = playlist[index];
  if (!track) return;

  currentIndex = index;
  currentTrack = track;
  activeRadio = false;
  if (track.source === "Local") {
    saveLocalMusicRecord({
      id: "playback-state",
      kind: "state",
      trackId: track.id
    }).catch(error => {
      console.error("No se pudo guardar la canción actual:", error);
      localStatus.textContent =
        "La canción se reproduce, pero no se pudo recordar para la próxima visita.";
    });
  }

  audio.pause();
  audio.src = track.audio;
  audio.load();

  audio.play().catch(error => {
    if (currentTrack !== track) return;
    console.error(error);
    if (track.source === "Local") {
      document.getElementById("playButton").textContent = "▶";
      document.getElementById("playButton").setAttribute("aria-label", "Reproducir");
      document.getElementById("screenPlayButton").textContent = "▶";
      document.getElementById("screenPlayButton").setAttribute("aria-label", "Reproducir");
      player.classList.remove("is-playing");
      if (error.name === "NotAllowedError") {
        localStatus.textContent =
          "Tu música está lista. Toca Reproducir para iniciar el audio.";
        return;
      }
      document.getElementById("localStatus").textContent =
        `No se pudo reproducir "${track.name}". Comprueba que el archivo no esté dañado y que el navegador admita su formato y códec.`;
      return;
    }
    alert("No se pudo reproducir esta canción. Prueba otra.");
  });

  updatePlayer(track);
}

// ACTUALIZAR REPRODUCTOR
function updatePlayer(track) {
  document.getElementById("playerTitle").textContent = track.name;
  document.getElementById("playerArtist").textContent = track.artist;

  playerCover.src = track.image || createCoverArt(track.name, track.artist);
  playerCover.alt = `Portada de ${track.name}`;
  document.getElementById("openPlaybackScreen").disabled = false;
  document.getElementById("playbackTitle").textContent = track.name;
  document.getElementById("playbackArtist").textContent =
    track.source === "Radio" ? `${track.artist} · EN VIVO` : track.artist;
  playbackCover.src = playerCover.src;
  playbackCover.alt = playerCover.alt;
  updateMediaSessionMetadata(track);

  document.getElementById("playButton").textContent = "Ⅱ";
  document.getElementById("playButton").setAttribute("aria-label", "Pausar");
  document.getElementById("screenPlayButton").textContent = "Ⅱ";
  document.getElementById("screenPlayButton").setAttribute("aria-label", "Pausar");
  if (localTracks.length) renderLocalTracks();
}

// CONTROLES
document.getElementById("playButton").addEventListener("click", () => {
  togglePlayback();
});

document.getElementById("screenPlayButton").addEventListener("click", () => {
  togglePlayback();
});

function togglePlayback() {
  if (!audio.src) return;

  if (audio.paused) {
    audio.play().catch(() => {
      alert("No se pudo reanudar la reproducción.");
    });
  } else {
    audio.pause();
  }
}

function updateMediaSessionMetadata(track) {
  if (!mediaSession || !("MediaMetadata" in window)) return;

  const artwork = track.image || createCoverArt(track.name, track.artist);
  try {
    mediaSession.metadata = new MediaMetadata({
      title: track.name,
      artist: track.artist || "MISTERPLAY MUSIC",
      album: "MISTERPLAY MUSIC",
      artwork: [{ src: artwork, sizes: "512x512" }]
    });
  } catch (error) {
    console.error("No se pudo actualizar la información de reproducción del sistema:", error);
  }
  updateMediaSessionPosition();
}

function updateMediaSessionPlaybackState(state) {
  if (!mediaSession) return;
  try {
    mediaSession.playbackState = state;
  } catch (error) {
    console.error("No se pudo actualizar el estado de reproducción del sistema:", error);
  }
}

function updateMediaSessionPosition() {
  if (!mediaSession?.setPositionState) return;

  try {
    if (!Number.isFinite(audio.duration) || audio.duration <= 0) {
      mediaSession.setPositionState();
      return;
    }

    mediaSession.setPositionState({
      duration: audio.duration,
      playbackRate: audio.playbackRate || 1,
      position: Math.min(audio.currentTime, audio.duration)
    });
  } catch (error) {
    console.error("No se pudo actualizar el avance de reproducción del sistema:", error);
  }
}

function registerMediaSessionActions() {
  if (!mediaSession) return;

  const actions = {
    play: () => {
      if (!audio.src || !audio.paused) return;
      const requestedTrack = currentTrack;
      audio.play().catch(error => {
        if (error.name === "AbortError" || currentTrack !== requestedTrack) return;
        console.error("No se pudo reanudar desde los controles del sistema:", error);
        if (currentTrack?.source === "Local") {
          localStatus.textContent =
            "No se pudo reanudar esta canción desde la notificación. Vuelve a intentarlo.";
        }
      });
    },
    pause: () => audio.pause(),
    previoustrack: playPreviousTrack,
    nexttrack: playNextTrack
  };

  Object.entries(actions).forEach(([action, handler]) => {
    try {
      mediaSession.setActionHandler(action, handler);
    } catch (error) {
      if (error.name !== "NotSupportedError") {
        console.error(`No se pudo activar el control multimedia "${action}":`, error);
      }
    }
  });
}

registerMediaSessionActions();

audio.addEventListener("play", () => {
  updateMediaSessionPlaybackState("playing");
  document.getElementById("playButton").textContent = "Ⅱ";
  document.getElementById("playButton").setAttribute("aria-label", "Pausar");
  document.getElementById("screenPlayButton").textContent = "Ⅱ";
  document.getElementById("screenPlayButton").setAttribute("aria-label", "Pausar");
  player.classList.add("is-playing");
  renderLocalTracks();
  renderRadioStations(radioStations);
});

audio.addEventListener("pause", () => {
  updateMediaSessionPlaybackState("paused");
  document.getElementById("playButton").textContent = "▶";
  document.getElementById("playButton").setAttribute("aria-label", "Reproducir");
  document.getElementById("screenPlayButton").textContent = "▶";
  document.getElementById("screenPlayButton").setAttribute("aria-label", "Reproducir");
  player.classList.remove("is-playing");
  renderLocalTracks();
  renderRadioStations(radioStations);
});

document.getElementById("nextButton").addEventListener("click", () => {
  playNextTrack();
});

document.getElementById("previousButton").addEventListener("click", () => {
  playPreviousTrack();
});

function playNextTrack() {
  if (activeRadio && currentRadioIndex >= 0 && radioStations.length) {
    playRadioStation((currentRadioIndex + 1) % radioStations.length);
  } else if (playlist.length && currentIndex >= 0) {
    if (shuffleLocalPlayback && currentIndex === playlist.length - 1) {
      playlist = shuffleTracks(localTracks, currentTrack?.id);
      playTrack(0);
      return;
    }
    playTrack((currentIndex + 1) % playlist.length);
  }
}

function playPreviousTrack() {
  if (activeRadio && currentRadioIndex >= 0 && radioStations.length) {
    playRadioStation((currentRadioIndex - 1 + radioStations.length) %
      radioStations.length);
  } else if (playlist.length && currentIndex >= 0) {
    playTrack((currentIndex - 1 + playlist.length) % playlist.length);
  }
}

function shuffleTracks(tracks, avoidFirstTrackId = "") {
  const shuffled = [...tracks];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] =
      [shuffled[randomIndex], shuffled[index]];
  }

  if (shuffled.length > 1 && shuffled[0].id === avoidFirstTrackId) {
    [shuffled[0], shuffled[1]] = [shuffled[1], shuffled[0]];
  }
  return shuffled;
}

function playAllLocalTracksRandomly() {
  if (!localTracks.length) {
    localStatus.textContent = "Primero selecciona canciones de tu dispositivo.";
    return;
  }

  playlist = shuffleTracks(localTracks, currentTrack?.id);
  shuffleLocalPlayback = true;
  localStatus.textContent =
    `Reproduciendo aleatoriamente las ${localTracks.length} canciones de tu biblioteca.`;
  playTrack(0);
}

document.getElementById("screenNextButton").addEventListener("click", () => {
  document.getElementById("nextButton").click();
});

document.getElementById("screenPreviousButton").addEventListener("click", () => {
  document.getElementById("previousButton").click();
});

document.getElementById("shuffleLocalTracks").addEventListener("click", () => {
  playAllLocalTracksRandomly();
});

document.getElementById("openPlaybackScreen").addEventListener("click", () => {
  playbackScreen.hidden = false;
  document.getElementById("closePlaybackScreen").focus();
});

document.getElementById("closePlaybackScreen").addEventListener("click", () => {
  playbackScreen.hidden = true;
  document.getElementById("openPlaybackScreen").focus();
});

playbackScreen.addEventListener("click", event => {
  if (event.target === playbackScreen) {
    playbackScreen.hidden = true;
    document.getElementById("openPlaybackScreen").focus();
  }
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !playbackScreen.hidden) {
    playbackScreen.hidden = true;
    document.getElementById("openPlaybackScreen").focus();
  }
  if (event.key === "Escape" && !videoPlaybackScreen.hidden) {
    closeVideoPlayback();
  }
});

// BARRA DE PROGRESO
audio.addEventListener("timeupdate", () => {
  updateMediaSessionPosition();
  if (!Number.isFinite(audio.duration)) return;

  const progress = (audio.currentTime / audio.duration) * 100;
  document.getElementById("progress").value = progress;
  playbackProgress.value = progress;

  const currentTime = formatTime(audio.currentTime);
  const duration = formatTime(audio.duration);
  document.getElementById("currentTime").textContent = currentTime;
  document.getElementById("playbackCurrentTime").textContent = currentTime;

  document.getElementById("duration").textContent = duration;
  document.getElementById("playbackDuration").textContent = duration;
});

audio.addEventListener("durationchange", updateMediaSessionPosition);
audio.addEventListener("loadedmetadata", updateMediaSessionPosition);

document.getElementById("progress").addEventListener("input", event => {
  if (Number.isFinite(audio.duration)) {
    audio.currentTime = (event.target.value / 100) * audio.duration;
  }
});

playbackProgress.addEventListener("input", event => {
  if (Number.isFinite(audio.duration)) {
    audio.currentTime = (event.target.value / 100) * audio.duration;
    document.getElementById("progress").value = event.target.value;
  }
});

audio.addEventListener("ended", () => {
  playNextTrack();
});

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "0:00";
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${min}:${String(sec).padStart(2, "0")}`;
}

// VOLUMEN
document.getElementById("volume").addEventListener("input", event => {
  audio.volume = Number(event.target.value);
  playbackVolume.value = event.target.value;
});

playbackVolume.addEventListener("input", event => {
  audio.volume = Number(event.target.value);
  document.getElementById("volume").value = event.target.value;
});

audio.volume = 0.8;

// RADIO ONLINE
async function searchRadio(query) {
  const searchId = ++radioSearchId;
  radioStatus.textContent = "";
  radioList.innerHTML = `<p class="empty">Buscando emisoras...</p>`;

  try {
    const searchFields = ["name", "state", "tag"];
    const results = await Promise.all(searchFields.map(async field => {
      const params = new URLSearchParams({
        [field]: query,
        limit: "25",
        hidebroken: "true",
        order: "votes",
        reverse: "true"
      });
      const response = await fetch(`${RADIO_API}/stations/search?${params}`);
      if (!response.ok) {
        throw new Error(`La búsqueda de radio respondió HTTP ${response.status}.`);
      }
      return response.json();
    }));
    if (searchId !== radioSearchId) return;
    const stations = Array.from(new Map(
      results.flat().map(station => [station.stationuuid, station])
    ).values()).slice(0, 50);
    renderRadioStations(stations);

  } catch (error) {
    if (searchId !== radioSearchId) return;
    console.error(error);
    radioStatus.textContent =
      "No se pudieron buscar emisoras. Comprueba tu conexión e inténtalo de nuevo.";
    radioList.innerHTML =
      `<p class="empty">No se pudieron cargar las emisoras.</p>`;
  }
}

async function searchNearbyRadio() {
  if (!("geolocation" in navigator)) {
    radioStatus.textContent =
      "Este navegador no ofrece ubicación. Escribe una ciudad en el campo para buscar emisoras locales.";
    return;
  }

  const searchId = ++radioSearchId;
  radioStatus.textContent =
    "Solicitando ubicación para buscar emisoras cercanas...";
  radioList.innerHTML = `<p class="empty">Buscando emisoras cercanas...</p>`;

  navigator.geolocation.getCurrentPosition(async position => {
    if (searchId !== radioSearchId) return;
    try {
      const params = new URLSearchParams({
        latitude: String(position.coords.latitude),
        longitude: String(position.coords.longitude),
        limit: "25",
        hidebroken: "true",
        order: "distance"
      });
      const response = await fetch(`${RADIO_API}/stations/nearby?${params}`);
      if (!response.ok) throw new Error(`Error de radio: HTTP ${response.status}`);
      const stations = await response.json();
      if (searchId !== radioSearchId) return;
      radioStatus.textContent = "Emisoras más cercanas a tu ubicación.";
      renderRadioStations(stations);
    } catch (error) {
      if (searchId !== radioSearchId) return;
      console.error("No se pudieron buscar emisoras cercanas:", error);
      radioStatus.textContent =
        "No se pudieron buscar emisoras cercanas. Escribe una ciudad para buscarla manualmente.";
      radioList.innerHTML =
        `<p class="empty">No se pudieron cargar las emisoras cercanas.</p>`;
    }
  }, error => {
    if (searchId !== radioSearchId) return;
    console.error("No se pudo obtener la ubicación:", error);
    radioStatus.textContent =
      "No se obtuvo tu ubicación. Permite el acceso o escribe una ciudad para buscar emisoras locales.";
    radioList.innerHTML =
      `<p class="empty">Puedes buscar emisoras por ciudad en el campo de búsqueda.</p>`;
  }, {
    enableHighAccuracy: false,
    timeout: 10000,
    maximumAge: 300000
  });
}

function renderRadioStations(stations) {
  radioStations = stations.filter(station => station.url_resolved);
  if (activeRadio && currentTrack?.stationId) {
    currentRadioIndex = radioStations.findIndex(
      station => station.stationuuid === currentTrack.stationId
    );
  }
  radioList.replaceChildren();

  if (!radioStations.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No encontramos emisoras. Prueba otro nombre o ciudad.";
    radioList.appendChild(empty);
    return;
  }

  radioStations.forEach((station, index) => {
    const item = document.createElement("div");
    item.className = "track";
    if (activeRadio && currentRadioIndex === index) {
      item.classList.add("radio-track-current");
    }

    const cover = document.createElement("img");
    cover.className = "track-cover";
    cover.src = station.favicon ||
      "https://placehold.co/100x100/101027/35e8ff?text=RADIO";
    cover.alt = `Logo de ${station.name || "radio"}`;

    const info = document.createElement("div");
    info.className = "track-info";

    const name = document.createElement("strong");
    name.textContent = station.name || "Radio online";

    const detail = document.createElement("small");
    detail.textContent =
      `${station.state || station.country || "Internacional"} · ${station.tags || "Música"}`;
    info.append(name, detail);

    const play = document.createElement("button");
    play.type = "button";
    const isPlaying = activeRadio && currentRadioIndex === index && !audio.paused;
    play.textContent = isPlaying ? "Ⅱ" : "▶";
    play.setAttribute(
      "aria-label",
      `${isPlaying ? "Pausar" : "Reproducir"} ${station.name || "radio"}`
    );
    play.addEventListener("click", () => {
      if (activeRadio && currentRadioIndex === index && !audio.paused) {
        audio.pause();
      } else {
        playRadioStation(index);
      }
    });

    item.append(cover, info, play);
    radioList.appendChild(item);
  });
}

function playRadioStation(index) {
  const station = radioStations[index];
  if (!station?.url_resolved) return;

  activeRadio = true;
  currentIndex = -1;
  currentRadioIndex = index;
  const track = {
    name: station.name || "Radio online",
    artist: station.state || station.country || "En directo",
    image: station.favicon || "",
    stationId: station.stationuuid,
    source: "Radio"
  };
  currentTrack = track;
  audio.pause();
  audio.src = station.url_resolved;
  audio.load();
  updatePlayer(currentTrack);
  renderRadioStations(radioStations);

  audio.play().catch(error => {
    if (currentTrack !== track) return;
    console.error("No se pudo reproducir la emisora:", error);
    radioStatus.textContent =
      "Esta emisora no permite reproducirse en este navegador o no está disponible.";
  });
}

document.getElementById("radioButton").addEventListener("click", () => {
  const query = document.getElementById("radioSearch").value.trim();
  if (query) searchRadio(query);
});

document.getElementById("nearbyRadioButton")
  .addEventListener("click", searchNearbyRadio);

document.getElementById("radioSearch").addEventListener("keydown", event => {
  if (event.key === "Enter") {
    document.getElementById("radioButton").click();
  }
});

videoDropZone.addEventListener("click", event => {
  if (!event.target.closest("button")) videoFilesInput.click();
});

videoDropZone.addEventListener("keydown", event => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    videoFilesInput.click();
  }
});

document.getElementById("chooseVideoFiles").addEventListener("click", () => {
  videoFilesInput.click();
});

["dragenter", "dragover"].forEach(eventName => {
  videoDropZone.addEventListener(eventName, event => {
    event.preventDefault();
    videoDropZone.classList.add("is-dragging");
  });
});

["dragleave", "drop"].forEach(eventName => {
  videoDropZone.addEventListener(eventName, event => {
    event.preventDefault();
    videoDropZone.classList.remove("is-dragging");
  });
});

videoDropZone.addEventListener("drop", event => {
  addLocalVideoFiles(Array.from(event.dataTransfer.files || []));
});

videoFilesInput.addEventListener("change", event => {
  addLocalVideoFiles(Array.from(event.target.files || []));
  event.target.value = "";
});

async function addLocalVideoFiles(files) {
  const videoFiles = files.filter(isLocalVideoFile);
  if (!videoFiles.length) {
    if (files.length) {
      videoStatus.textContent =
        "No se encontraron archivos de video compatibles.";
    }
    return;
  }

  await localMusicReady;
  const newVideos = [];
  const filesByVideoId = new Map();
  videoFiles.forEach(file => {
    const id = getLocalVideoId(file);
    if (localVideos.some(video => video.id === id) ||
      newVideos.some(video => video.id === id)) return;
    const video = {
      id,
      name: file.name,
      url: URL.createObjectURL(file)
    };
    newVideos.push(video);
    filesByVideoId.set(id, file);
  });

  if (!newVideos.length) {
    videoStatus.textContent = "Esos videos ya están en tu biblioteca.";
    return;
  }

  videoStatus.textContent = "Guardando videos en tu biblioteca...";
  localVideos.push(...newVideos);
  renderLocalVideos();

  let saveError = false;
  try {
    await Promise.all(newVideos.map(video => {
      const file = filesByVideoId.get(video.id);
      return saveLocalMusicRecord({
        id: video.id,
        kind: "video",
        name: file.name,
        type: file.type,
        blob: file,
        lastModified: file.lastModified,
        addedAt: Date.now()
      });
    }));
  } catch (error) {
    console.error("No se pudieron guardar los videos locales:", error);
    saveError = true;
    videoStatus.textContent =
      "Los videos se cargaron, pero no se pudieron guardar para la próxima visita. Revisa el espacio disponible.";
  }

  const skippedCount = files.length - videoFiles.length;
  if (skippedCount) {
    videoStatus.textContent +=
      ` Se omitieron ${skippedCount} archivo(s) que no parecen ser de video.`;
  } else if (!saveError) {
    videoStatus.textContent =
      `${newVideos.length} ${newVideos.length === 1 ? "video añadido" : "videos añadidos"} y guardados en este dispositivo.`;
  }
}

function isLocalVideoFile(file) {
  if (file.type.startsWith("video/")) return true;
  return /\.(mp4|m4v|webm|ogv|ogg|mov|mkv|avi|mpeg|mpg|3gp|wmv|flv)$/i
    .test(file.name);
}

function getLocalVideoId(file) {
  return `video:${file.name.toLowerCase()}:${file.size}:${file.lastModified}`;
}

function playLocalVideo(video) {
  currentVideoId = video.id;
  audio.pause();
  localVideoPlayer.pause();
  localVideoPlayer.src = video.url;
  localVideoPlayer.load();
  document.getElementById("videoPlaybackTitle").textContent = video.name;
  document.getElementById("videoPlaybackStatus").textContent = "";
  videoPlaybackScreen.hidden = false;
  document.getElementById("closeVideoPlayback").focus();
  localVideoPlayer.play().catch(error => {
    console.error(`No se pudo reproducir el video "${video.name}":`, error);
    document.getElementById("videoPlaybackStatus").textContent =
      "El navegador no pudo reproducir este archivo. Puede que no admita su formato o códec.";
  });
}

function closeVideoPlayback() {
  localVideoPlayer.pause();
  localVideoPlayer.removeAttribute("src");
  localVideoPlayer.load();
  videoPlaybackScreen.hidden = true;
  const currentVideo = Array.from(videoList.querySelectorAll("[data-video-id]"))
    .find(item => item.dataset.videoId === currentVideoId);
  if (currentVideo) currentVideo.focus();
}

videoPlaybackScreen.addEventListener("click", event => {
  if (event.target === videoPlaybackScreen) closeVideoPlayback();
});
document.getElementById("closeVideoPlayback")
  .addEventListener("click", closeVideoPlayback);
localVideoPlayer.addEventListener("error", () => {
  if (videoPlaybackScreen.hidden) return;
  document.getElementById("videoPlaybackStatus").textContent =
    "No se pudo abrir el video. Prueba otro formato o códec compatible con tu navegador.";
});

// ARCHIVOS LOCALES
document.getElementById("chooseLocalFiles").addEventListener("click", () => {
  localFilesInput.click();
});

localDropZone.addEventListener("click", event => {
  if (!event.target.closest("button")) localFilesInput.click();
});

localDropZone.addEventListener("keydown", event => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    localFilesInput.click();
  }
});

["dragenter", "dragover"].forEach(eventName => {
  localDropZone.addEventListener(eventName, event => {
    event.preventDefault();
    localDropZone.classList.add("is-dragging");
  });
});

["dragleave", "drop"].forEach(eventName => {
  localDropZone.addEventListener(eventName, event => {
    event.preventDefault();
    localDropZone.classList.remove("is-dragging");
  });
});

localDropZone.addEventListener("drop", event => {
  addLocalAudioFiles(Array.from(event.dataTransfer.files || []));
});

localFilesInput.addEventListener("change", event => {
  const selectedFiles = Array.from(event.target.files || []);
  event.target.value = "";
  addLocalAudioFiles(selectedFiles);
});

async function addLocalAudioFiles(files) {
  const audioFiles = files.filter(isLocalAudioFile);

  if (!audioFiles.length) {
    if (files.length) {
      localStatus.textContent =
        "No se encontraron archivos de audio. Selecciona MP3 u otro formato de audio compatible.";
    }
    return;
  }

  await localMusicReady;
  const newTracks = [];
  const filesByTrackId = new Map();
  audioFiles.forEach(file => {
    const id = getLocalAudioId(file);
    if (localTracks.some(track => track.id === id) ||
      newTracks.some(track => track.id === id)) return;

    const url = URL.createObjectURL(file);
    filesByTrackId.set(id, file);
    newTracks.push({
      id,
      name: file.name.replace(/\.[^/.]+$/, ""),
      artist: "Mi teléfono / computadora",
      image: findLocalCover(file.name),
      coverKey: normalizeFileName(file.name),
      audio: url,
      source: "Local"
    });
  });

  if (!newTracks.length) {
    localStatus.textContent = "Esas canciones ya están en tu biblioteca.";
    return;
  }

  localStatus.textContent =
    `Añadiendo ${newTracks.length} ${newTracks.length === 1 ? "canción seleccionada" : "canciones seleccionadas"} a tu biblioteca...`;
  localTracks.push(...newTracks);
  playlist = localTracks;

  let persistenceError = false;
  try {
    const addedAt = Date.now();
    await saveLocalMusicRecords(newTracks.map((track, index) => {
      const file = filesByTrackId.get(track.id);
      return {
        id: track.id,
        kind: "audio",
        name: file.name,
        type: file.type,
        blob: file,
        lastModified: file.lastModified,
        addedAt: addedAt + index
      };
    }));
  } catch (error) {
    console.error("No se pudo guardar la biblioteca local:", error);
    persistenceError = true;
  }

  renderLocalTracks();
  const skippedCount = files.length - audioFiles.length;
  const duplicateCount = audioFiles.length - newTracks.length;
  playAllLocalTracksRandomly();

  const messages = [
    `${newTracks.length} ${newTracks.length === 1 ? "canción añadida" : "canciones añadidas"}.`
  ];
  if (duplicateCount) {
    messages.push(
      `${duplicateCount} ${duplicateCount === 1 ? "ya estaba" : "ya estaban"} en tu biblioteca.`
    );
  }
  messages.push("Toda tu biblioteca quedó en reproducción aleatoria.");
  if (persistenceError) {
    messages.push(
      "No se pudieron guardar todas las canciones para la próxima visita. Revisa el espacio disponible del navegador."
    );
  }
  if (skippedCount) {
    messages.push(
      `Se omitieron ${skippedCount} archivo(s) que no parecen ser de audio.`
    );
  }
  localStatus.textContent = messages.join(" ");
}

function isLocalAudioFile(file) {
  if (file.type.startsWith("audio/")) return true;
  return /\.(mp1|mp2|mp3|mpeg|mpg|wav|ogg|oga|opus|m4a|aac|flac|webm|aiff|aif)$/i
    .test(file.name);
}

function getLocalAudioId(file) {
  return `audio:${file.name.toLowerCase()}:${file.size}:${file.lastModified}`;
}

document.getElementById("localCovers").addEventListener("change", async event => {
  const files = Array.from(event.target.files || [])
    .filter(file => file.type.startsWith("image/"));

  if (!files.length) {
    if (event.target.files.length) {
      localStatus.textContent = "Selecciona archivos de imagen para las portadas.";
    }
    event.target.value = "";
    return;
  }

  let coverPersistenceError = false;
  try {
    await Promise.all(files.map(async file => {
      const key = normalizeFileName(file.name);
      const url = URL.createObjectURL(file);
      const previousUrl = localCovers.get(key);
      if (previousUrl) {
        URL.revokeObjectURL(previousUrl);
        localCoverUrls.delete(previousUrl);
      }
      localCoverUrls.add(url);
      localCovers.set(key, url);
      await saveLocalMusicRecord({
        id: `cover:${key}`,
        kind: "cover",
        name: file.name,
        type: file.type,
        blob: file
      });
    }));
  } catch (error) {
    console.error("No se pudieron guardar las portadas locales:", error);
    coverPersistenceError = true;
    localStatus.textContent =
      "Las portadas se añadieron, pero no se pudieron guardar para la próxima visita.";
  }

  localTracks.forEach(track => {
    track.image = localCovers.get(track.coverKey) || "";
  });
  if (currentTrack?.source === "Local") updatePlayer(currentTrack);

  renderLocalTracks();
  if (!coverPersistenceError) {
    localStatus.textContent =
      `${files.length} ${files.length === 1 ? "portada añadida" : "portadas añadidas"}. Se conservarán en esta biblioteca.`;
  }
  event.target.value = "";
});

async function restoreLocalMusic() {
  try {
    const records = await readLocalMusicRecords();
    records.filter(record => record.kind === "cover").forEach(record => {
      const key = normalizeFileName(record.name);
      const url = URL.createObjectURL(record.blob);
      localCoverUrls.add(url);
      localCovers.set(key, url);
    });

    localTracks = records
      .filter(record => record.kind === "audio")
      .sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0))
      .map(record => {
        const url = URL.createObjectURL(record.blob);
        return {
          id: record.id,
          name: record.name.replace(/\.[^/.]+$/, ""),
          artist: "Mi teléfono / computadora",
          image: findLocalCover(record.name),
          coverKey: normalizeFileName(record.name),
          audio: url,
          source: "Local"
        };
      });
    localVideos = records
      .filter(record => record.kind === "video")
      .sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0))
      .map(record => ({
        id: record.id,
        name: record.name,
        url: URL.createObjectURL(record.blob)
      }));
    playlist = localTracks;
    renderLocalTracks();
    renderLocalVideos();

    const savedPlayback = records.find(record => record.id === "playback-state");
    const savedTrackIndex = savedPlayback
      ? localTracks.findIndex(track => track.id === savedPlayback.trackId)
      : -1;
    if (savedTrackIndex >= 0) {
      currentIndex = savedTrackIndex;
      currentTrack = localTracks[savedTrackIndex];
      audio.src = currentTrack.audio;
      audio.load();
      updatePlayer(currentTrack);
      document.getElementById("playButton").textContent = "▶";
      document.getElementById("playButton").setAttribute("aria-label", "Reproducir");
      document.getElementById("screenPlayButton").textContent = "▶";
      document.getElementById("screenPlayButton").setAttribute("aria-label", "Reproducir");
    }

    if (localTracks.length) {
      localStatus.textContent = savedTrackIndex >= 0
        ? `${localTracks.length} ${localTracks.length === 1 ? "canción guardada" : "canciones guardadas"}. Pulsa ▶ para continuar con "${currentTrack.name}".`
        : `${localTracks.length} ${localTracks.length === 1 ? "canción guardada" : "canciones guardadas"} en este dispositivo.`;
    }
  } catch (error) {
    console.error("No se pudo restaurar la biblioteca local:", error);
    localStatus.textContent =
      "No se pudo leer la biblioteca guardada. Puedes cargar las canciones de nuevo.";
  }
}

const localMusicReady = restoreLocalMusic();

function renderLocalVideos() {
  videoList.replaceChildren();
  document.getElementById("localVideoCount").textContent =
    `${localVideos.length} ${localVideos.length === 1 ? "video" : "videos"}`;
  if (!localVideos.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "Todavía no has añadido videos.";
    videoList.appendChild(empty);
    return;
  }

  localVideos.forEach(video => {
    const item = document.createElement("div");
    item.className = "track local-video-track";

    const cover = document.createElement("img");
    cover.className = "track-cover video-thumbnail";
    cover.src = createCoverArt(video.name.replace(/\.[^/.]+$/, ""), "Video local");
    cover.alt = `Vista previa de ${video.name}`;

    const info = document.createElement("div");
    info.className = "track-info";
    const name = document.createElement("strong");
    name.textContent = video.name;
    const detail = document.createElement("small");
    detail.textContent = "Guardado en este dispositivo";
    info.append(name, detail);

    const play = document.createElement("button");
    play.type = "button";
    play.textContent = "▶";
    play.dataset.videoId = video.id;
    play.setAttribute("aria-label", `Reproducir video ${video.name}`);
    play.addEventListener("click", () => playLocalVideo(video));

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove-video-button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Eliminar video ${video.name}`);
    remove.addEventListener("click", () => removeLocalVideo(video));

    item.append(cover, info, play, remove);
    videoList.appendChild(item);
  });
}

async function removeLocalVideo(video) {
  try {
    await deleteLocalMediaRecord(video.id);
  } catch (error) {
    console.error(`No se pudo eliminar "${video.name}" de la biblioteca:`, error);
    videoStatus.textContent =
      "No se pudo eliminar el video guardado. Inténtalo de nuevo.";
    return;
  }

  const index = localVideos.findIndex(item => item.id === video.id);
  if (index >= 0) localVideos.splice(index, 1);
  URL.revokeObjectURL(video.url);
  if (currentVideoId === video.id) closeVideoPlayback();
  currentVideoId = "";
  renderLocalVideos();
  videoStatus.textContent = `"${video.name}" se quitó de la biblioteca.`;
}

function renderLocalTracks() {
  localList.replaceChildren();
  document.getElementById("localTrackCount").textContent =
    `${localTracks.length} ${localTracks.length === 1 ? "canción" : "canciones"}`;
  document.getElementById("shuffleLocalTracks").disabled = localTracks.length === 0;
  if (!localTracks.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "Tu lista aparecerá aquí después de cargar canciones.";
    localList.appendChild(empty);
    return;
  }

  localTracks.forEach((track, index) => {
    const item = document.createElement("div");
    item.className = "track local-track";
    if (currentTrack?.id === track.id) item.classList.add("is-current");

    const cover = document.createElement("img");
    cover.className = "track-cover";
    cover.src = track.image || createCoverArt(track.name, track.artist);
    cover.alt = `Portada de ${track.name}`;

    const info = document.createElement("div");
    info.className = "track-info";
    const name = document.createElement("strong");
    name.textContent = track.name;
    const artist = document.createElement("small");
    artist.textContent = currentTrack?.id === track.id && !audio.paused
      ? "Reproduciendo ahora"
      : "Guardada en este dispositivo";
    info.append(name, artist);

    const play = document.createElement("button");
    play.type = "button";
    play.textContent = "▶";
    play.setAttribute("aria-label", `Reproducir ${track.name}`);
    play.addEventListener("click", () => {
      playlist = localTracks;
      shuffleLocalPlayback = false;
      playTrack(index);
    });

    item.append(cover, info, play);
    localList.appendChild(item);
  });
}

function normalizeFileName(fileName) {
  return fileName.replace(/\.[^/.]+$/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function findLocalCover(audioFileName) {
  return localCovers.get(normalizeFileName(audioFileName)) || "";
}

function createCoverArt(title, artist) {
  const escapeXML = value => String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
  const hue = Array.from(title).reduce((sum, character) =>
    sum + character.charCodeAt(0), 0) % 360;
  const shortTitle = title.length > 24 ? `${title.slice(0, 22)}…` : title;
  const shortArtist = artist.length > 28 ? `${artist.slice(0, 26)}…` : artist;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="hsl(${hue} 62% 25%)"/><stop offset="1" stop-color="hsl(${(hue + 82) % 360} 70% 48%)"/></linearGradient><radialGradient id="r"><stop stop-color="white" stop-opacity=".24"/><stop offset="1" stop-color="white" stop-opacity="0"/></radialGradient></defs><rect width="400" height="400" rx="22" fill="url(#g)"/><circle cx="200" cy="170" r="142" fill="url(#r)"/><circle cx="200" cy="170" r="108" fill="none" stroke="white" stroke-opacity=".23"/><circle cx="200" cy="170" r="82" fill="none" stroke="white" stroke-opacity=".16"/><text x="200" y="200" text-anchor="middle" fill="white" font-size="118" font-family="Arial">♫</text><path d="M42 290h316" stroke="white" stroke-opacity=".25"/><text x="42" y="330" fill="white" font-size="21" font-family="Arial" font-weight="bold">${escapeXML(shortTitle)}</text><text x="42" y="360" fill="white" fill-opacity=".72" font-size="15" font-family="Arial">${escapeXML(shortArtist)}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

// MODO CLARO / OSCURO
document.getElementById("themeButton").addEventListener("click", () => {
  document.body.classList.toggle("light");
});