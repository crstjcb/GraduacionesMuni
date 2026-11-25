'use strict';
const eventsView = document.getElementById('events-view');
const featuredView = document.getElementById('featured-view');
const galleryView = document.getElementById('gallery-view');
const eventGrid = document.getElementById('events-grid');
const featuredGrid = document.getElementById('featured-grid');
const galleryList = document.getElementById('gallery-list');
const viewer = document.getElementById('viewer');
const downloadAll = document.getElementById('download-all');
const loadMore = document.getElementById('gallery-more');
const PAGE_SIZE = 48;
let activeSection = null;
let galleryOffset = 0;
let shownPhotos = [];
let galleryRequest = 0;

const CAP_ICON = `<svg width="65" height="65" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 10v6"/><path d="M2 10 12 5l10 5-10 5L2 10Z"/><path d="M6 12v5c3.5 3 8.5 3 12 0v-5"/><path d="M22 16v3"/><path d="M21 21h2l-1-2z"/></svg>`;
function renderEvents() {
  eventGrid.replaceChildren();
  featuredGrid.replaceChildren();
  for (const event of EVENTS) {
    const card = make('article', 'event-card');
    const cover = make('div', 'cover' + (event.featured ? ' featured-cover' : ''));
    const mark = make('div', 'graduation-icon');
    mark.innerHTML = CAP_ICON; // SVG constante, no proviene de datos del usuario.
    const label = make('span', '', event.featured ? 'Abanderados y momentos especiales' : 'Fotografías de graduación');
    cover.append(mark, label);
    const body = make('div', 'card-body');
    body.append(make('span', 'card-label', event.featured ? 'Momentos para recordar' : 'Graduación 2026'), make('h3', 'display', event.time));
    const button = make('button', 'btn full', 'Ver fotografías');
    button.type = 'button';
    button.addEventListener('click', () => openGallery(event));
    body.append(button);
    card.append(cover, body);
    (event.featured ? featuredGrid : eventGrid).append(card);
  }
}
async function openGallery(event) {
  activeSection = event.id;
  galleryOffset = 0;
  eventsView.classList.add('hidden');
  featuredView.classList.add('hidden');
  galleryView.classList.remove('hidden');
  document.getElementById('gallery-title').textContent = event.featured
    ? 'Graduación 2026 · Momentos destacados' : 'Graduación 2026 · ' + event.time;
  window.scrollTo({ top: 0, behavior: 'instant' });
  await renderGallery();
}
async function renderGallery() {
  const request = ++galleryRequest;
  galleryList.replaceChildren();
  document.getElementById('gallery-empty').classList.add('hidden');
  downloadAll.disabled = true;
  loadMore.disabled = true;
  loadMore.classList.add('hidden');
  document.getElementById('gallery-count').textContent = 'Cargando fotografías…';
  try {
    const page = await photosPage(activeSection, galleryOffset, PAGE_SIZE);
    if (request !== galleryRequest) return;
    shownPhotos = page.photos;
    const totalShown = Math.min(galleryOffset + page.photos.length, page.total);
    document.getElementById('gallery-count').textContent = `${page.total} fotografías · mostrando ${totalShown}`;
    if (!page.total) {
      document.getElementById('gallery-empty').classList.remove('hidden');
      return;
    }
    downloadAll.disabled = false;
    downloadAll.textContent = 'Descargar esta página (ZIP)';
    loadMore.classList.toggle('hidden', totalShown >= page.total);
    for (const photo of page.photos) {
      const card = make('article', 'photo');
      const image = make('img');
      image.src = publicPhotoUrl(photo);
      image.alt = photo.filename;
      image.loading = 'lazy';
      image.addEventListener('click', () => showViewer(publicPhotoUrl(photo, false), photo.filename));
      const body = make('div', 'photo-bottom');
      const title = make('div', 'photo-name', photo.filename);
      title.title = photo.filename;
      const actions = make('div', 'photo-actions');
      const download = make('button', 'btn small', 'Descargar');
      download.type = 'button';
      download.addEventListener('click', async () => {
        download.disabled = true;
        try { await downloadOriginal(photo); }
        catch (error) { alert('No se pudo descargar: ' + asText(error)); }
        finally { download.disabled = false; }
      });
      actions.append(download);
      body.append(title, actions);
      card.append(image, body);
      galleryList.append(card);
    }
  } catch (error) {
    if (request === galleryRequest) {
      document.getElementById('gallery-count').textContent = 'No se pudo acceder a las fotografías';
      galleryList.append(make('p', 'alert error', asText(error)));
    }
  } finally {
    if (request === galleryRequest) loadMore.disabled = false;
  }
}
function showViewer(url, name) {
  document.getElementById('viewer-img').src = url;
  document.getElementById('viewer-title').textContent = name;
  viewer.classList.remove('hidden');
}
function closeViewer() {
  viewer.classList.add('hidden');
  document.getElementById('viewer-img').removeAttribute('src');
}
async function loadZip() {
  if (window.JSZip) return window.JSZip;
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
  return new Promise((resolve, reject) => {
    script.onload = () => window.JSZip ? resolve(window.JSZip) : reject(new Error('No se pudo cargar JSZip'));
    script.onerror = () => reject(new Error('No hay conexión para preparar el ZIP'));
    document.head.append(script);
  });
}
async function downloadZip() {
  if (!shownPhotos.length) return;
  downloadAll.disabled = true;
  downloadAll.textContent = 'Descargando archivos…';
  try {
    const ZIP = await loadZip();
    const archive = new ZIP();
    const used = new Set();
    for (let i = 0; i < shownPhotos.length; i++) {
      const photo = shownPhotos[i];
      const data = await fetchOriginalBlob(photo);
      let name = fileName(photo);
      let suffix = 2;
      while (used.has(name.toLowerCase())) name = `${baseName(fileName(photo))} (${suffix++})${fileExt(photo.mime_type)}`;
      used.add(name.toLowerCase());
      archive.file(name, data);
      downloadAll.textContent = `Preparando ${i + 1}/${shownPhotos.length}…`;
    }
    const result = await archive.generateAsync({ type: 'blob', compression: 'STORE' });
    saveBlob(result, `Graduacion_2026_${activeSection}_pagina_${Math.floor(galleryOffset / PAGE_SIZE) + 1}.zip`);
  } catch (error) { alert('Error al generar ZIP: ' + asText(error)); }
  finally { downloadAll.disabled = false; downloadAll.textContent = 'Descargar esta página (ZIP)'; }
}
document.getElementById('back-btn').addEventListener('click', () => {
  ++galleryRequest;
  closeViewer();
  galleryList.replaceChildren();
  galleryView.classList.add('hidden');
  eventsView.classList.remove('hidden');
  featuredView.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'instant' });
});
downloadAll.addEventListener('click', downloadZip);
loadMore.addEventListener('click', () => { galleryOffset += PAGE_SIZE; renderGallery(); });
document.getElementById('viewer-close').addEventListener('click', closeViewer);
viewer.addEventListener('click', event => { if (event.target === viewer) closeViewer(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeViewer(); });
renderEvents();
