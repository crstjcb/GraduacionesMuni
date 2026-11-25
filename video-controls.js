"use strict";

// El navegador permite autoplay normalmente solo si el video inicia silenciado.
const graduationVideo = document.getElementById("graduation-video");
const soundToggle = document.getElementById("video-sound-toggle");
const soundLabel = document.getElementById("video-sound-label");
const soundIcon = document.getElementById("video-sound-icon");

if (graduationVideo && soundToggle) {
  const updateSoundButton = () => {
    const isAudible = !graduationVideo.muted;
    soundLabel.textContent = isAudible ? "Silenciar" : "Activar sonido";
    soundIcon.textContent = isAudible ? "🔊" : "🔇";
    soundToggle.setAttribute("aria-pressed", String(isAudible));
    soundToggle.setAttribute("aria-label", isAudible ? "Silenciar video" : "Activar sonido del video");
  };

  soundToggle.addEventListener("click", async () => {
    graduationVideo.muted = !graduationVideo.muted;
    graduationVideo.volume = 1;
    updateSoundButton();
    if (graduationVideo.paused) {
      try {
        await graduationVideo.play();
      } catch (error) {
        graduationVideo.muted = true;
        updateSoundButton();
        console.warn("No se pudo iniciar la reproducción:", error);
      }
    }
  });
  graduationVideo.addEventListener("volumechange", updateSoundButton);
  updateSoundButton();
}
