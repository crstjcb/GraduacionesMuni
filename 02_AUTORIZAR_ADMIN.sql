-- PASO 2: PRIMERO crear la cuenta en Authentication > Users > Add user.
-- En la cuenta, poner la contraseña que acordaste: la contraseña elegida fuera de este repositorio.
-- Copiar el User UID (UUID) real de Supabase. Luego reemplazar este marcador.
-- Este archivo NO contiene ni necesita almacenar la contraseña.

insert into public.app_admins (user_id)
values ('REEMPLAZA_AQUI_EL_USER_UID'::uuid)
on conflict (user_id) do nothing;
