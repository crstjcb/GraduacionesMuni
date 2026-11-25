# Graduación Chinautla 2026 — GitHub Pages + Supabase

Esta versión **no utiliza Python**. GitHub Pages publica los archivos HTML/CSS/JS/video; Supabase guarda las fotografías originales, miniaturas y nombres. Los padres pueden usar las galerías desde cualquier dispositivo. El administrador ve **solo el campo «Contraseña»** en `admin.html`.

## 1. Crear el proyecto de Supabase

1. Entrá a https://supabase.com/dashboard y creá un proyecto.
2. Abrí **SQL Editor**. Pegá y ejecutá el contenido de `supabase/01_INSTALAR.sql`.
3. Entrá a **Authentication > Users > Add user**, y creá UNA cuenta de administrador, con un email que controles y la contraseña que elegiste en el chat. Marcá que el email esté confirmado cuando corresponda.
4. Copiá el campo **User UID** del usuario que acabás de crear.
5. En SQL Editor ejecutá `supabase/02_AUTORIZAR_ADMIN.sql` después de reemplazar `REEMPLAZA_AQUI_EL_USER_UID` por ese UID (conservando comillas).
6. En **Project Settings > API** (o Connect) buscá **Project URL** y la **publishable key** / **anon public key**. **NUNCA uses service_role ni secret keys en la web**.

## 2. Configurar la conexión

Abrí `js/config.js` y cambiá exactamente estos valores:

```js
SUPABASE_URL: 'https://TU-PROYECTO.supabase.co',
SUPABASE_PUBLIC_KEY: 'PEGA_AQUI_LA_CLAVE_PUBLICA',
ADMIN_EMAIL: 'el-correo-que-creaste@dominio.com',
```

La contraseña **NO se escribe en config.js, HTML ni JS**. Solamente se registra al crear el usuario en Supabase. La página envía el password de ese formulario mediante `supabase.auth.signInWithPassword()` al servidor de Supabase. Aunque el correo esté definido en JavaScript, los permisos reales de escritura se validan con `auth.uid()` + reglas RLS.

**Probá**: el público abre `index.html`; la administración se abre en `admin.html` y pide solo la contraseña que elegiste en el chat. La clave es la que configuraste en Supabase Auth.

## 3. Publicar en GitHub Pages

1. Creá un repositorio de GitHub (preferentemente público para Pages en cuentas gratuitas).
2. Subí el contenido de ESTA carpeta directamente a la raíz del repositorio: `index.html`, `admin.html`, `graduacion-2026.mp4`, `Logomunicipal.png`, `css/`, `js/`, `supabase/`, `.nojekyll`.
3. En **Settings > Pages**, elegí **Deploy from a branch**, rama `main`, carpeta `/(root)` y guardá.
4. Abrí `https://TU-USUARIO.github.io/TU-REPOSITORIO/` y `https://TU-USUARIO.github.io/TU-REPOSITORIO/admin.html`.
5. Para prevenir problemas de Auth, en Supabase **Authentication > URL Configuration**, agregá la URL de tu GitHub Pages en **Site URL / Redirect URLs** si correspondiera. Este proyecto usa contraseña, no enlaces de inicio de sesión por email.

**Nota sobre el video:** `graduacion-2026.mp4` viene incluido en el ZIP (H.264 + audio). Ocupa aproximadamente 75 MB; GitHub tiene límites de tráfico/almacenamiento, y el video podría consumir muchos datos móviles. Conviene comprimirlo más antes de una difusión masiva.

## 4. Cómo subir y descargar fotografías

- En `admin.html` ingresá tu contraseña.
- Seleccioná **Momentos destacados**, **8 AM**, **11 AM**, **2 PM** o **5 PM**.
- Elegí **Seleccionar fotos** o **Seleccionar carpeta**. Cada foto se sube a Supabase Storage con una miniatura optimizada.
- Podés **renombrar individualmente**, **renombrar en lote con numeración** y **eliminar una foto o todas las fotos de una sección**.
- Los padres abren `index.html`, ven las fotos sin contraseña y descargan originales o un ZIP de la página visible (máximo 48 fotos por ZIP), evitando congelar teléfonos con más de 2,000 originales.
- Las fotos se guardan en Supabase y **no desaparecen por cambiar de navegador o a localhost** después de subirlas correctamente. No se borran al actualizar GitHub Pages.

## 5. Fotos antiguas que estaban en IndexedDB

**No se migran automáticamente**: cada dirección web (por ejemplo `file:///` y `http://localhost:5500` y GitHub Pages) tiene una base de navegador independiente.

El botón **«Importar fotos antiguas del navegador»** en el panel puede recuperar los blobs existentes si esta nueva versión se ejecuta en **exactamente el mismo navegador, host y puerto** donde se subieron originalmente. Si las fotos solo existen en otra dirección, primero entrá desde ese origen o exportalas desde el navegador original. **No borres los datos del navegador antiguo** antes de recuperar las fotos. La migración puede volver a subir duplicados si se ejecuta dos veces.

## Seguridad y capacidad

- La contraseña fue definida por vos durante esta conversación y deliberadamente NO se incluye en el código público. **Es recomendable sustituirla por una más larga y única antes de publicar**, desde Supabase Authentication > Users.
- El link `admin.html` es accesible, pero **las acciones de escritura están bloqueadas del lado de Supabase** para usuarios que no figuren en `app_admins`.
- El bucket `graduacion-fotos` es **público**, porque los padres deben ver las fotografías sin registrarse. Subí únicamente imágenes que tengas autorización para publicar.
- 2,000 imágenes en su resolución original pueden ocupar varios GB. Verificá la cuota y los precios del plan de Supabase que contratés; 2,000 archivos no garantizan que el almacenamiento sea gratuito.
- Realizá copias de seguridad de los archivos originales. El borrado masivo es irreversible.
- Si cambiaste las credenciales de Supabase o los permisos, actualizá `js/config.js` y ejecutá el SQL que corresponda. El correo del administrador es una configuración, NO una contraseña pública.

## Arquitectura

- `index.html` / `js/public.js`: galería pública paginada.
- `admin.html` / `js/admin.js`: login con solo contraseña, cargas, ediciones y borrados.
- `js/cloud.js`: acceso a Supabase Storage + tabla `photos`.
- `js/config.js`: URL, clave **pública** y correo configurado; ninguna contraseña.
- `css/styles.css`: diseño municipal azul y rojo, incluido estilo Reel en celular.
- `graduacion-2026.mp4`: video original de la portada, controles de audio en `js/video-controls.js`.
- `supabase/*.sql`: tablas, permisos RLS, bucket y activación de administrador.
