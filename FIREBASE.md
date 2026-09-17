# Migración de 96 Barber Shop a Firebase

El código utiliza Firebase modular 10.14.1 desde CDN, Firestore, Authentication (email/contraseña), Cloud Functions y Storage para las imágenes. No requiere compilar el frontend ni instalar Firebase con npm en la web.

Los formularios, modales, CSS y contenido HTML se conservan. Los únicos cambios de HTML son los scripts de entrada de tipo module. La aplicación ya no utiliza LocalStorage como base de datos. Authentication conserva la sesión de la pestaña mediante su propia persistencia de sesión.

## Antes de publicar

Este paquete contiene código y reglas; no significa que el proyecto remoto ya esté configurado o desplegado.

1. En el proyecto **barber-shop-74019**, habilitá Firestore en modo nativo y Authentication → Email/Password. Agregá el dominio final a los dominios autorizados de Authentication.
2. Habilitá Cloud Storage y comprobá que el bucket sea **barber-shop-74019.firebasestorage.app**. Las imágenes que antes se guardaban como Base64 ahora se suben a Storage, y Firestore guarda su URL. Se admiten PNG/JPEG/WEBP/GIF hasta 10 MB. El formulario sigue siendo el mismo.
3. Para desplegar Functions/Storage necesitás la facturación correspondiente habilitada (plan Blaze). Elegí presupuesto y alertas en tu consola. La región configurada de Functions es **southamerica-east1** en js/config.js y functions/index.cjs; deben coincidir.
4. Usá Node.js 22 para Functions e instalá Firebase CLI en tu equipo. Desde esta carpeta:

   npm --prefix functions ci
   firebase login
   firebase use barber-shop-74019

5. Exportá primero los datos locales como se explica abajo. No abras una versión vieja que reinicialice datos de muestra sobre otro origen.
6. Desplegá reglas, índices y funciones antes de la web:

   firebase deploy --only firestore,storage,functions

   El despliegue puede preguntar si se habilitan los permisos de Storage para consultar perfiles de Firestore. Son necesarios para que solo administradores puedan subir imágenes.
7. Importá tus datos y creá la cuenta maestra con el script descrito abajo. No se crea automáticamente una cuenta con la contraseña pública Barber96!.
8. Probá login, consulta del catálogo, reserva, caja, edición de cobro y administradores. Después publicá:

   firebase deploy --only hosting

Podés alojar la web en otro hosting HTTPS: subí index.html, admin.html, css/, assets/ y js/. No publiques functions/, scripts/, exportaciones, archivos de credenciales ni este documento como archivos del sitio.

## Exportar el LocalStorage actual

1. Abrí el sitio viejo en **el mismo navegador, perfil, dominio y puerto** donde están tus datos. LocalStorage es específico del origen: otro navegador o dominio puede tener otra base.
2. Abrí DevTools → Console y ejecutá el contenido de **scripts/export-local.js**.
3. Se descargará **local-export-AAAA-MM-DD.json**. Guardalo fuera de la carpeta publicada. Contiene datos personales; no lo subas a Git ni lo compartas públicamente.
4. El exportador no borra ni cambia LocalStorage. Exporta catálogo, barberos, clientes, turnos, caja y emails de administradores. **No exporta contraseñas**.
5. Si operabas desde varios dispositivos con bases locales distintas, exportá cada origen. Revisá y conciliá sus IDs, teléfonos y turnos antes de importar.

## Importar y crear administradores

El importador usa Firebase Admin SDK desde tu equipo. Requiere credenciales de Google Cloud con acceso a Firestore, Authentication y Storage. La apiKey web no permite ejecutar esta importación administrativa.

Configurá Application Default Credentials, por ejemplo con:

   gcloud auth application-default login
   gcloud auth application-default set-quota-project barber-shop-74019

Alternativamente, configurá GOOGLE_APPLICATION_CREDENTIALS con la ruta a una cuenta de servicio autorizada, guardada fuera de la web. No pongas claves privadas en js/config.js.

Primero ejecutá una validación local, que no escribe en Firebase:

   node scripts/import-local.cjs --file C:/Backups/local-export-2026-09-16.json --master tu-email@ejemplo.com

Para importar:

   node scripts/import-local.cjs --file C:/Backups/local-export-2026-09-16.json --master tu-email@ejemplo.com --apply --credentials-out C:/Backups/admin-credentials.json

Para crear solamente la cuenta maestra en una base vacía, omití --file. Los catálogos quedarán vacíos hasta que los cargues o importes; no se insertan registros ficticios.

Comportamiento:

- Conserva los IDs de documentos, los vínculos entre clientes/turnos/ventas, notas, fechas y totales. Genera índices de teléfono y disponibilidad pública.
- Omite documentos que ya existen en la nube. No reemplaza tus cambios posteriores ni borra colecciones.
- Valida duplicados de teléfono, IDs y horarios en el archivo; verifica conflictos de teléfono/horario con la nube antes de importar registros.
- La importación completa no es una única transacción. Si falla a mitad de camino, corregí la causa y volvé a ejecutar el mismo archivo: las escrituras son por registro y se pueden reanudar. Hacela antes de abrir las reservas públicas.
- Crea las cuentas en Authentication y sus perfiles en administrators. Si la cuenta Auth ya existe, conserva su contraseña.
- Para cuentas nuevas, genera contraseñas aleatorias y las guarda en el archivo privado indicado por --credentials-out. No las imprime ni las guarda en Firestore. Usá esas claves para entrar y cambiarlas desde Configuraciones.
- Si un perfil existente tiene otro rol, el script no lo eleva silenciosamente a maestro.
- Normaliza los pagos históricos al esquema actual de Efectivo/Transferencia/MP. Conviene revisar los registros antiguos que usaban otros métodos antes de importarlos.
- Trasladará imágenes Base64 del catálogo a Storage. El resto de los campos del catálogo mantiene su contenido.

## Acceso y privacidad

**Público:** lectura de servicios, barberos, productos y un documento de disponibilidad para un barbero/fecha. La disponibilidad solo contiene date, barberId y slots (horas con identificadores opacos), nunca teléfonos, nombres ni notas.

**Administrador activo:** lectura de clientes, turnos completos y caja; CRUD de catálogos. Las funciones controlan las operaciones relacionadas entre varias colecciones.

**Maestro:** además puede crear administradores, cambiar sus contraseñas y eliminarlos. Las contraseñas pertenecen a Authentication; administrators solo contiene perfil, rol y estado.

**Denegado al público:** customers, appointments, sales, administrators, customerPhones y bookingLimits. Tampoco se permite escribir directamente reservas o cobros desde el SDK web: se validan mediante funciones.

Las reservas usan una transacción que crea el turno, vincula el cliente y ocupa el horario. El precio y nombre del servicio se obtienen del catálogo en el servidor. Se mantienen los horarios de inicio originales (intervalos de 30 minutos, de 09:00 a 16:00; domingo cerrado para la web). No se introduce una nueva agenda basada en duración.

Los cobros y el estado del turno se guardan juntos. Los reintentos de una misma petición no duplican reservas ni cobros. Un cliente no puede decidir precios de reserva ni obtener la ficha de otros clientes.

Eliminar un administrador desactiva primero su perfil, lo que revoca inmediatamente el acceso por reglas incluso si tiene un token vigente. El cambio de contraseña invalida la renovación de sesiones; un token ya emitido puede durar hasta su vencimiento.

## Protección adicional de las reservas públicas

La función pública tiene un límite transaccional de 12 reservas por IP/hora. Es una defensa básica; no sustituye App Check.

Para activar App Check:

1. Registrá la web en Firebase App Check con reCAPTCHA Enterprise.
2. Poné su clave pública en appCheckSiteKey, en js/config.js, y publicá la web.
3. Revisá las métricas de tokens válidos antes de exigirlos.
4. Configurá ENFORCE_APP_CHECK=true para Functions (archivo functions/.env.barber-shop-74019) y redesplegá las funciones.

No actives la exigencia sin configurar el proveedor del frontend: bloquearía las reservas. Los contadores bookingLimits tienen expiresAt; podés activar una política TTL para ese campo desde Firestore y evitar acumular contadores expirados.

## Reglas y documentación

Validación realizada: reglas de Firestore y operaciones de Functions contra emuladores de Firestore/Authentication; privacidad pública, cuentas revocadas, colisión de reservas, reintentos, cobros atómicos, edición, cancelación y gestión de administradores. Se probó la importación dos veces, conservando modificaciones posteriores en la nube simulada. Los formularios se probaron en navegador con transporte asíncrono simulado, y se comparó el HTML/CSS con los originales. Las cargas de Storage y la configuración del proyecto real aún requieren una prueba tras la activación. No se desplegó ni importó nada en el proyecto real.

- firestore.rules: privacidad y autorizaciones de la base.
- storage.rules: imágenes públicas y subidas solo por administradores.
- firestore.indexes.json: consulta por fecha/barbero.
- firebase.json: despliegue y emuladores.

Documentación oficial:

- https://firebase.google.com/docs/web/alt-setup
- https://firebase.google.com/docs/firestore/manage-data/transactions
- https://firebase.google.com/docs/firestore/security/rules-conditions
- https://firebase.google.com/docs/auth/admin/manage-users
- https://firebase.google.com/docs/functions/callable
