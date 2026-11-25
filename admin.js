'use strict';

const timeNav = document.getElementById('time-nav');
const photoList = document.getElementById('admin-photos');
const fileInput = document.getElementById('files-input');
const folderInput = document.getElementById('folder-input');
const uploadMessage = document.getElementById('upload-message');
const loginPanel = document.getElementById('login-panel');
const adminApp = document.getElementById('admin-app');
const loginStatus = document.getElementById('login-status');

let currentSection = 'destacados';
let adminOffset = 0;
let latestUploadedIds = [];
let uploadedSection = null;
let uploadBusy = false;
let renameRows = [];
let renameSection = null;
let photoRequest = 0;
const ADMIN_PAGE_SIZE = 30;
const RENAME_PREVIEW_LIMIT = 120;

function getCurrentEvent() { return EVENTS.find(e => e.id === currentSection); }
function requireAdminEmail() {
  const email = CONFIG.ADMIN_EMAIL || '';
  if (!email.includes('@') || email.endsWith('@ejemplo.com'))
    throw new Error('Configurá ADMIN_EMAIL en js/config.js. Consultá INSTRUCCIONES.md.');
  return email;
}
function showLogin(message = '') {
  adminApp.classList.add('hidden');
  loginPanel.classList.remove('hidden');
  loginStatus.textContent = message;
}
async function showAdmin() {
  loginPanel.classList.add('hidden');
  adminApp.classList.remove('hidden');
  renderTimeNav();
  updateHeadings();
  await renderPhotos();
}
async function initializeLogin() {
  try {
    requireCloud();
    requireAdminEmail();
    const { data: { session }, error } = await db.auth.getSession();
    if (error) throw error;
    if (session && await isAdministrator()) { await showAdmin(); return; }
    if (session) await db.auth.signOut();
    showLogin();
  } catch (error) { showLogin(asText(error)); }
}
document.getElementById('login-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = document.getElementById('login-button');
  button.disabled = true;
  loginStatus.textContent = 'Verificando acceso…';
  try {
    const email = requireAdminEmail();
    const { error } = await requireCloud().auth.signInWithPassword({
      email, password: document.getElementById('admin-password').value
    });
    if (error) throw new Error('Contraseña incorrecta o cuenta sin configurar.');
    if (!await isAdministrator()) {
      await db.auth.signOut();
      throw new Error('La cuenta existe, pero no tiene permisos de administrador. Revisá el SQL de instalación.');
    }
    document.getElementById('admin-password').value = '';
    loginStatus.textContent = '';
    await showAdmin();
  } catch (error) { loginStatus.textContent = asText(error); }
  finally { button.disabled = false; }
});
document.getElementById('logout').addEventListener('click', async () => {
  await db?.auth.signOut();
  closeRename();
  showLogin('Sesión cerrada.');
});

function renderTimeNav() {
  timeNav.replaceChildren();
  for (const event of [EVENTS[4], ...EVENTS.slice(0, 4)]) {
    const button = make('button', 'time-btn' + (currentSection === event.id ? ' active' : ''), event.time);
    button.type = 'button';
    button.disabled = uploadBusy;
    button.addEventListener('click', async () => {
      if (uploadBusy) return;
      currentSection = event.id;
      adminOffset = 0;
      ++photoRequest;
      closeRename();
      renderTimeNav();
      updateHeadings();
      uploadMessage.textContent = '';
      await renderPhotos();
    });
    timeNav.append(button);
  }
}
function updateHeadings() {
  for (const id of ['selected-title', 'photos-title', 'danger-title'])
    document.getElementById(id).textContent = getCurrentEvent().time;
}
async function renderPhotos() {
  const request = ++photoRequest;
  photoList.replaceChildren();
  document.getElementById('photo-count').textContent = 'Cargando…';
  try {
    const page = await photosPage(currentSection, adminOffset, ADMIN_PAGE_SIZE);
    if (request !== photoRequest) return;
    const { photos, total } = page;
    document.getElementById('admin-prev').disabled = adminOffset <= 0;
    document.getElementById('admin-next').disabled = adminOffset + ADMIN_PAGE_SIZE >= total;
    document.getElementById('open-rename').disabled = !total;
    document.getElementById('delete-section').disabled = !total;
    document.getElementById('photo-count').textContent = `${total} fotografías · página ${Math.floor(adminOffset / ADMIN_PAGE_SIZE) + 1}`;
    document.getElementById('admin-empty').classList.toggle('hidden', total !== 0);
    for (const photo of photos) {
      const card = make('article', 'admin-photo');
      const image = make('img');
      image.src = publicPhotoUrl(photo);
      image.loading = 'lazy';
      image.alt = photo.filename;
      const body = make('div', 'admin-photo-body');
      const label = make('label', 'tiny', 'Nombre de la fotografía');
      const input = make('input');
      input.type = 'text';
      input.value = baseName(photo.filename);
      input.maxLength = 120;
      input.setAttribute('aria-label', 'Renombrar ' + photo.filename);
      const actions = make('div', 'photo-actions');
      const rename = make('button', 'btn small', 'Guardar nombre');
      rename.addEventListener('click', async () => {
        rename.disabled = true;
        try { await renamePhoto(photo, input.value); await renderPhotos(); }
        catch (error) { alert('No se pudo cambiar el nombre: ' + asText(error)); }
        finally { rename.disabled = false; }
      });
      const remove = make('button', 'btn red small', 'Eliminar');
      remove.addEventListener('click', async () => {
        if (!confirm('¿Eliminar la fotografía "' + photo.filename + '"?')) return;
        remove.disabled = true;
        try { await deletePhoto(photo); await renderPhotos(); }
        catch (error) { alert(asText(error)); remove.disabled = false; }
      });
      actions.append(rename, remove);
      body.append(label, input, actions);
      card.append(image, body);
      photoList.append(card);
    }
  } catch (error) {
    if (request === photoRequest) photoList.append(make('p', 'alert error', asText(error)));
  }
}
function setProgress(done, total) {
  const track = document.getElementById('upload-progress');
  track.classList.toggle('hidden', !total);
  document.getElementById('upload-progress-fill').style.width = `${total ? Math.round(100 * done / total) : 0}%`;
}
function setUploadControls(disabled) {
  document.querySelectorAll('.time-btn,#pick-files,#pick-folder,#delete-section,#migrate-legacy').forEach(el => el.disabled = disabled);
}
async function upload(files) {
  const images = Array.from(files).filter(file => IMAGE_MIME.has(file.type));
  if (uploadBusy) return;
  if (!images.length) { uploadMessage.textContent = 'Seleccioná archivos JPG, PNG, WebP, GIF o AVIF.'; return; }
  uploadBusy = true;
  setUploadControls(true);
  const section = currentSection;
  let done = 0;
  let failed = 0;
  const newIds = [];
  try {
    for (const file of images) {
      try { newIds.push(await uploadOne(file, section)); }
      catch (error) {
        failed++;
        uploadMessage.textContent = `Error en ${file.name}: ${asText(error)}. Se continuará con el resto.`;
      }
      done++;
      setProgress(done, images.length);
      if (!failed) uploadMessage.textContent = `Subiendo ${done} de ${images.length} fotografías…`;
    }
    latestUploadedIds = newIds;
    uploadedSection = section;
    uploadMessage.textContent = `${newIds.length} fotos subidas a ${getCurrentEvent().time}. ${failed ? failed + ' no se pudieron subir.' : 'Todo correcto.'}`;
  } finally {
    fileInput.value = '';
    folderInput.value = '';
    uploadBusy = false;
    setUploadControls(false);
    adminOffset = 0;
    setTimeout(() => setProgress(0, 0), 2000);
    await renderPhotos();
    if (newIds.length) await openRename('recent');
  }
}
document.getElementById('pick-files').addEventListener('click', () => fileInput.click());
document.getElementById('pick-folder').addEventListener('click', () => folderInput.click());
fileInput.addEventListener('change', () => upload(fileInput.files));
folderInput.addEventListener('change', () => upload(folderInput.files));
document.getElementById('reload').addEventListener('click', renderPhotos);
document.getElementById('admin-prev').addEventListener('click', () => { adminOffset = Math.max(0, adminOffset - ADMIN_PAGE_SIZE); renderPhotos(); });
document.getElementById('admin-next').addEventListener('click', () => { adminOffset += ADMIN_PAGE_SIZE; renderPhotos(); });
const dropZone = document.getElementById('drop-zone');
dropZone.addEventListener('dragover', event => { event.preventDefault(); dropZone.classList.add('drag'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag'));
dropZone.addEventListener('drop', event => { event.preventDefault(); dropZone.classList.remove('drag'); upload(event.dataTransfer.files); });

// Confirmación reforzada para el borrado de una sección completa.
const overlay = document.getElementById('confirm-overlay');
const confirmation = document.getElementById('confirm-input');
const deleteConfirm = document.getElementById('confirm-delete');
function closeDelete() { overlay.classList.add('hidden'); confirmation.value = ''; deleteConfirm.disabled = true; }
document.getElementById('delete-section').addEventListener('click', () => {
  document.getElementById('confirm-description').textContent = 'Vas a borrar todas las fotografías de ' + getCurrentEvent().time + '. Las demás secciones permanecerán intactas. Esto no se puede deshacer.';
  overlay.dataset.section = currentSection;
  confirmation.value = '';
  deleteConfirm.disabled = true;
  overlay.classList.remove('hidden');
  confirmation.focus();
});
confirmation.addEventListener('input', () => { deleteConfirm.disabled = confirmation.value.trim() !== 'ELIMINAR'; });
document.getElementById('cancel-delete').addEventListener('click', closeDelete);
overlay.addEventListener('click', event => { if (event.target === overlay) closeDelete(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeDelete(); });
deleteConfirm.addEventListener('click', async () => {
  if (confirmation.value.trim() !== 'ELIMINAR') return;
  deleteConfirm.disabled = true;
  const section = overlay.dataset.section;
  try {
    const count = await removeSection(section, (done, total) => {
      document.getElementById('confirm-description').textContent = `Eliminando ${done} de ${total}… No cerrés la página.`;
    });
    closeDelete();
    latestUploadedIds = [];
    closeRename();
    uploadMessage.textContent = `Se eliminaron ${count} fotografías de la sección.`;
    adminOffset = 0;
    await renderPhotos();
  } catch (error) { alert('Error de eliminación: ' + asText(error)); deleteConfirm.disabled = false; }
});

// Edición masiva: permite miles de registros, pero muestra un máximo de 120 campos a la vez.
const renamePanel = document.getElementById('rename-panel');
const renameList = document.getElementById('rename-list');
const renameScope = document.getElementById('rename-scope');
const renameBase = document.getElementById('rename-base');
const renameMessage = document.getElementById('rename-message');
function closeRename() {
  renamePanel.classList.add('hidden');
  renameRows = [];
  renameSection = null;
  renameMessage.textContent = '';
}
function renderRenameRows() {
  renameList.replaceChildren();
  for (let i = 0; i < Math.min(RENAME_PREVIEW_LIMIT, renameRows.length); i++) {
    const row = renameRows[i];
    const item = make('div', 'rename-item');
    const input = make('input');
    input.type = 'text';
    input.maxLength = 120;
    input.value = row.name;
    input.setAttribute('aria-label', `Nombre de fotografía ${i + 1}`);
    input.addEventListener('input', () => { row.name = input.value; });
    item.append(make('span', 'rename-index', String(i + 1)), input, make('span', 'ext', fileExt(row.photo.mime_type)));
    renameList.append(item);
  }
  const extra = renameRows.length - RENAME_PREVIEW_LIMIT;
  if (extra > 0) renameList.append(make('p', 'muted', `${extra} fotografías adicionales se pueden renombrar con la numeración automática. Para editarlas por separado, usá el listado de la sección.`));
  document.getElementById('rename-count').textContent = `${renameRows.length} fotografías seleccionadas`;
}
async function openRename(scope = 'all') {
  renameScope.value = scope;
  renameSection = currentSection;
  renameMessage.textContent = 'Cargando nombres…';
  renamePanel.classList.remove('hidden');
  try {
    const photos = await allPhotoMetadata(currentSection);
    if (renameSection !== currentSection) return;
    const selected = scope === 'recent' && uploadedSection === currentSection
      ? photos.filter(p => latestUploadedIds.includes(p.id)) : photos;
    if (!selected.length) { closeRename(); return; }
    renameRows = selected.map(photo => ({ photo, name: baseName(photo.filename), initial: baseName(photo.filename) }));
    renameMessage.textContent = '';
    renameBase.value = '';
    renderRenameRows();
    document.getElementById('rename-subtitle').textContent = `${getCurrentEvent().time} · ${selected.length} fotografías seleccionadas`;
    renamePanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) { renameMessage.textContent = asText(error); }
}
document.getElementById('open-rename').addEventListener('click', () => openRename(latestUploadedIds.length && uploadedSection === currentSection ? 'recent' : 'all'));
document.getElementById('close-rename').addEventListener('click', closeRename);
renameScope.addEventListener('change', () => openRename(renameScope.value));
document.getElementById('apply-rename-base').addEventListener('click', () => {
  const base = baseName(safeName(renameBase.value));
  if (!renameBase.value.trim()) { renameMessage.textContent = 'Escribí un nombre base.'; return; }
  const digits = Math.max(3, String(renameRows.length).length);
  renameRows.forEach((row, i) => { row.name = `${base} ${String(i + 1).padStart(digits, '0')}`; });
  renderRenameRows();
  renameMessage.textContent = 'Numeración preparada. Presioná Guardar todos los nombres.';
});
document.getElementById('save-renames').addEventListener('click', async () => {
  if (!renameRows.length || renameSection !== currentSection) return;
  if (renameRows.some(row => !row.name.trim())) { renameMessage.textContent = 'No dejés nombres vacíos.'; return; }
  const button = document.getElementById('save-renames');
  button.disabled = true;
  let saved = 0;
  try {
    const pending = renameRows.filter(row => fileName(row.photo, row.name) !== row.photo.filename);
    // Pocos cambios simultáneos para evitar saturar las conexiones de Supabase.
    for (let start = 0; start < pending.length; start += 5) {
      const group = pending.slice(start, start + 5);
      const results = await Promise.allSettled(group.map(row => renamePhoto(row.photo, row.name)));
      for (const result of results) {
        if (result.status === 'rejected') throw result.reason;
        saved++;
      }
      renameMessage.textContent = `Guardando nombres: ${saved} de ${pending.length}…`;
    }
    renameMessage.textContent = `${saved} nombres actualizados correctamente.`;
    await renderPhotos();
  } catch (error) { renameMessage.textContent = `Se actualizaron ${saved}; hubo un error: ${asText(error)}`; }
  finally { button.disabled = false; }
});

// Recuperación opcional: solo lee IndexedDB si las fotos antiguas siguen en ESTE mismo origen.
document.getElementById('migrate-legacy').addEventListener('click', async () => {
  if (!confirm('¿Importar a Supabase las fotos antiguas de este navegador y dirección? No se borrarán las originales locales.')) return;
  if (uploadBusy) return;
  uploadBusy = true;
  setUploadControls(true);
  let uploaded = 0;
  try {
    const legacy = await new Promise((resolve, reject) => {
      const request = indexedDB.open('graduacion-chinautla-2026-v1');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (!legacy.objectStoreNames.contains('photos')) throw new Error('No hay fotos antiguas en este origen.');
    const photos = await new Promise((resolve, reject) => {
      const tx = legacy.transaction('photos', 'readonly');
      const result = [];
      const request = tx.objectStore('photos').openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        result.push(cursor.value);
        cursor.continue();
      };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
    });
    for (const photo of photos) {
      if (!photo.blob || !EVENTS.some(e => e.id === photo.section)) continue;
      const blob = photo.blob;
      const filename = fileName({ mime_type: blob.type || 'image/jpeg' }, photo.name);
      const file = new File([blob], filename, { type: blob.type || 'image/jpeg' });
      await uploadOne(file, photo.section);
      uploadMessage.textContent = `Recuperando ${++uploaded} de ${photos.length} fotografías…`;
    }
    uploadMessage.textContent = `Se copiaron ${uploaded} fotos antiguas a Supabase. Las originales del navegador no se eliminaron.`;
    await renderPhotos();
  } catch (error) { uploadMessage.textContent = `No se pudo completar la migración: ${asText(error)}`; }
  finally { uploadBusy = false; setUploadControls(false); }
});

initializeLogin();
