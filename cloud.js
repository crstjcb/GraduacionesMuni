'use strict';

const EVENTS = Object.freeze([
  { id: '08', time: '8:00 a. m.', label: '08:00' },
  { id: '11', time: '11:00 a. m.', label: '11:00' },
  { id: '14', time: '2:00 p. m.', label: '14:00' },
  { id: '17', time: '5:00 p. m.', label: '17:00' },
  { id: 'destacados', time: 'Momentos destacados', label: 'Destacados', featured: true }
]);

const CONFIG = window.GRAD_CONFIG || {};
const CONFIG_READY = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(CONFIG.SUPABASE_URL || '')
  && CONFIG.SUPABASE_PUBLIC_KEY && !CONFIG.SUPABASE_PUBLIC_KEY.includes('PEGA_AQUI')
  && Boolean(window.supabase?.createClient);
const db = CONFIG_READY ? window.supabase.createClient(
  CONFIG.SUPABASE_URL,
  CONFIG.SUPABASE_PUBLIC_KEY,
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } }
) : null;

const IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

function requireCloud() {
  if (!db) throw new Error('Falta configurar Supabase en js/config.js. Consultá INSTRUCCIONES.md.');
  return db;
}
function asText(error) { return error?.message || String(error); }
function make(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = String(text);
  return el;
}
function safeName(name) {
  return String(name || 'Fotografia')
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, '-')
    .replace(/\s+/g, ' ').trim().slice(0, 130) || 'Fotografia';
}
function baseName(name) { return String(name || '').replace(/\.(jpe?g|png|webp|gif|avif)$/i, ''); }
function fileExt(mime) {
  return ({ 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'image/avif': '.avif' })[mime] || '.jpg';
}
function fileName(photo, name = photo.filename) {
  return safeName(baseName(name)) + fileExt(photo.mime_type);
}
function checkFile(file) {
  if (!IMAGE_MIME.has(file.type)) throw new Error('Formato no permitido: ' + file.name + '. Usá JPG, PNG, WebP, GIF o AVIF.');
  if (file.size > MAX_IMAGE_BYTES) throw new Error('La imagen supera los 25 MB: ' + file.name);
}
function publicPhotoUrl(photo, thumb = true) {
  const path = (thumb && photo.thumb_path) ? photo.thumb_path : photo.storage_path;
  return requireCloud().storage.from(CONFIG.BUCKET).getPublicUrl(path).data.publicUrl;
}
async function photosPage(section, offset = 0, limit = 48) {
  const { data, error, count } = await requireCloud()
    .from('photos')
    .select('id,section,filename,storage_path,thumb_path,mime_type,created_at', { count: 'exact' })
    .eq('section', section)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return { photos: data || [], total: count || 0 };
}
async function allPhotoMetadata(section) {
  const rows = [];
  for (let offset = 0;; offset += 500) {
    const page = await photosPage(section, offset, 500);
    rows.push(...page.photos);
    if (rows.length >= page.total || !page.photos.length) break;
  }
  return rows;
}
async function fetchOriginalBlob(photo) {
  // Descarga pública: Supabase recomienda la URL pública para buckets públicos.
  const response = await fetch(publicPhotoUrl(photo, false));
  if (!response.ok) throw new Error(`La fotografía no está disponible (HTTP ${response.status}).`);
  return response.blob();
}
async function downloadOriginal(photo) {
  saveBlob(await fetchOriginalBlob(photo), fileName(photo));
}
function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
async function createThumbnail(file) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 640 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve, reject) => canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error('No se pudo crear miniatura')),
      'image/jpeg', 0.78
    ));
  } catch {
    return null; // Si falla WebP/AVIF u otra decodificación, se conserva el original.
  } finally {
    bitmap?.close?.();
  }
}
async function uploadOne(file, section) {
  checkFile(file);
  if (!EVENTS.some(event => event.id === section)) throw new Error('Sección inválida');
  const storage = requireCloud().storage.from(CONFIG.BUCKET);
  const id = crypto.randomUUID();
  const originalPath = `${section}/${id}${fileExt(file.type)}`;
  const thumbPath = `${section}/miniaturas/${id}.jpg`;
  const { error: uploadError } = await storage.upload(originalPath, file, {
    upsert: false, contentType: file.type, cacheControl: '86400'
  });
  if (uploadError) throw uploadError;
  let uploadedThumb = null;
  try {
    const thumb = await createThumbnail(file);
    if (thumb) {
      const { error: thumbError } = await storage.upload(thumbPath, thumb, {
        upsert: false, contentType: 'image/jpeg', cacheControl: '86400'
      });
      if (!thumbError) uploadedThumb = thumbPath;
    }
    const { data, error } = await requireCloud().from('photos').insert({
      section,
      filename: fileName({ mime_type: file.type }, file.name),
      storage_path: originalPath,
      thumb_path: uploadedThumb,
      mime_type: file.type,
      file_size: file.size
    }).select('id').single();
    if (error) throw error;
    return data.id;
  } catch (error) {
    await storage.remove([originalPath, ...(uploadedThumb ? [uploadedThumb] : [])]);
    throw error;
  }
}
async function renamePhoto(photo, newBaseName) {
  if (!newBaseName.trim()) throw new Error('El nombre no puede estar vacío.');
  const filename = fileName(photo, newBaseName);
  const { error } = await requireCloud().from('photos')
    .update({ filename }).eq('id', photo.id);
  if (error) throw error;
  return filename;
}
async function deletePhoto(photo) {
  const { error } = await requireCloud().from('photos').delete().eq('id', photo.id);
  if (error) throw error;
  const { error: storageError } = await requireCloud().storage.from(CONFIG.BUCKET)
    .remove([photo.storage_path, ...(photo.thumb_path ? [photo.thumb_path] : [])]);
  if (storageError) throw new Error('Registro eliminado, pero quedó un archivo que requiere limpieza: ' + asText(storageError));
}
async function removeSection(section, report = () => {}) {
  const photos = await allPhotoMetadata(section);
  let deleted = 0;
  for (const photo of photos) {
    await deletePhoto(photo);
    report(++deleted, photos.length);
  }
  return deleted;
}
async function isAdministrator() {
  const { data, error } = await requireCloud().rpc('is_admin');
  if (error) throw error;
  return data === true;
}
