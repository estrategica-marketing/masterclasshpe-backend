# Administradores: alta y gestión manual

Los administradores entran a `/admin/participantes` para consultar y exportar (Excel/CSV) los registros de la landing. El panel **no** tiene una sección para crear administradores; se crean de una de estas dos formas:

1. con el script `npm run crear-admin` (recomendado);
2. con SQL directo en la BD.

Los participantes que se registran en la landing nunca se vuelven administradores: el registro ignora correos de cuentas que no son PARTICIPANTE, y el script se niega a convertir una cuenta existente.

## 1. Script `crear-admin`

Se ejecuta en la carpeta del backend, con las variables `PG_*` de la BD a la que se quiere apuntar.

```bash
# Alta con contraseña temporal generada (se imprime una sola vez)
npm run crear-admin -- ana.lopez@hpe.com "Ana López"

# Alta con contraseña elegida (10–72 caracteres, letras y números)
npm run crear-admin -- ana.lopez@hpe.com "Ana López" --password "ClaveSegura2027"

# Admin existente: nueva contraseña, lo reactiva y cierra sus sesiones abiertas
npm run crear-admin -- ana.lopez@hpe.com "Ana López" --reset

# Dentro del contenedor de la API
docker exec -it <contenedor-api> npm run crear-admin -- ana.lopez@hpe.com "Ana López"
```

Qué hace el script:

- Si el correo no existe, crea el usuario con rol ADMIN, la cuenta ya activada y el perfil con empresa "HPE".
- Si el correo ya es de un admin, sólo actúa con `--reset`; sin esa opción muestra un error.
- Si el correo es de un participante, muestra un error y no cambia nada.

Comparte la contraseña temporal con la persona por un canal seguro.

## 2. SQL directo (psql, DBeaver, etc.)

Las contraseñas se guardan con bcrypt. PostgreSQL puede generar un hash compatible con la extensión `pgcrypto`; basta habilitarla una vez:

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

### Crear un admin

```sql
WITH u AS (
   INSERT INTO users (email, password_hash, id_rol, email_verificado_at)
   VALUES (lower('ana.lopez@hpe.com'), crypt('ClaveTemporal2027', gen_salt('bf', 12)),
           (SELECT id_rol FROM roles WHERE clave = 'ADMIN'), NOW())
   RETURNING id_user
)
INSERT INTO profiles (id_user, nombre_completo, empresa)
SELECT id_user, 'Ana López', 'HPE' FROM u;
```

El correo debe ir en minúsculas y con dominio completo (por ejemplo, `@hpe.com`). La contraseña debe tener entre 10 y 72 caracteres, con letras y números.

### Listar admins

```sql
SELECT u.id_user, u.email, p.nombre_completo, u.activo, u.last_login_at
FROM users u
JOIN roles r ON r.id_rol = u.id_rol
LEFT JOIN profiles p ON p.id_user = u.id_user
WHERE r.clave = 'ADMIN'
ORDER BY u.created_at;
```

### Desactivar o reactivar

Desactivar sube `token_version`, así que cualquier sesión abierta se cierra de inmediato.

```sql
UPDATE users SET activo = FALSE, token_version = token_version + 1 WHERE email = 'ana.lopez@hpe.com';
UPDATE users SET activo = TRUE WHERE email = 'ana.lopez@hpe.com';
```

### Cambiar la contraseña

```sql
UPDATE users
SET password_hash = crypt('NuevaClave2027', gen_salt('bf', 12)), token_version = token_version + 1
WHERE email = 'ana.lopez@hpe.com';
```

## Recomendaciones

- Crea una cuenta por persona; no compartas cuentas. Así `last_login_at` indica quién entró.
- Cada admin puede cambiar su contraseña temporal con "¿Olvidaste tu contraseña?" en el login. Ese flujo envía un correo, así que en producción necesita SMTP configurado (`SMTP_HOST`…). Mientras no lo esté, usa `--reset` o el SQL de arriba.
- Desactiva las cuentas que ya no se usen en lugar de borrarlas.
