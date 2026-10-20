# Sorteo de Residencias SSRO

Aplicación para preparar, ejecutar, verificar y consultar sorteos de residencias del Servicio Social de Salud Rural Obligatorio.

## Código

`src/` contiene la aplicación y `database/` contiene las migraciones propias del sorteo. La configuración del entorno y la integración con el sistema de origen se suministran fuera del repositorio.

Para compilar el código:

```sh
npm ci
npm run build
```

El inicio requiere la configuración y los datos del entorno correspondiente. La consulta de verificación del origen se entrega mediante `SOURCE_FINGERPRINT_SQL` desde la configuración privada. Este repositorio no incluye credenciales, archivos de entorno, datos de participantes ni parámetros de servidores.

## Actualización de seguridad

Sobre una base preparada con las migraciones `02-sorteo-web.sql` a `090-shared-results.sql`, detener la versión anterior y ejecutar con `DATABASE_URL` y la misma `MASTER_KEY` del entorno:

```sh
npm ci
npm run build
npm run migrate:security
npm start
```

`migrate:security` aplica `database/10-security.sql` y cifra las copias existentes de sorteos y simulaciones dentro de una transacción. Es idempotente y valida también las copias ya cifradas. No ejecutar únicamente el archivo SQL: la conversión de datos requiere el script. La versión anterior no puede leer el nuevo formato; ante una reversión se deben restaurar juntos código y base de datos anteriores. Los respaldos anteriores conservan su formato original.

Las sesiones anteriores requieren iniciar sesión nuevamente. Las nuevas sesiones vencen a las ocho horas y se invalidan al cerrar sesión, cambiar la contraseña o eliminar el administrador. La cookie contiene un identificador aleatorio; en la base se guarda su hash y el contenido sensible de la sesión cifrado.

Los resultados de simulación y sus enlaces vencen a la hora. Se conservan como máximo 50 simulaciones recientes entre todos los administradores. La aplicación limpia datos temporales vencidos al iniciar, cada minuto y al guardar una simulación. Los resultados oficiales se conservan para auditoría.

### Proxy y HTTPS

`TRUSTED_PROXIES` acepta direcciones, redes CIDR o nombres de redes reconocidos por Express, separados por comas. Por defecto se confía en `loopback`, para un proxy local. Configurar las direcciones reales si el proxy está en otro equipo o contenedor; usar `none` para una instalación sin proxy. No se aceptan valores booleanos ni un número de saltos. El último proxy de confianza debe sobrescribir `X-Forwarded-For` con la cadena de clientes verificada.

En HTTPS, configurar `COOKIE_SECURE=true` y `PUBLIC_ORIGIN` con la URL pública correcta. La construcción y verificación de paquetes JSON funciona sin configuración SSH; las variables `SSRO_BRIDGE_*` solo son obligatorias al habilitar la transferencia.

SheetJS se fija en la versión 0.20.3, distribuida por su [fuente oficial](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/), porque npm mantiene una versión anterior sin los fixes de seguridad.

## Pruebas

```sh
npm test
```

La suite de integración requiere PostgreSQL y una base desechable cuyo nombre comience por `ssro_test_`. Reconstruye los esquemas `public` y `sorteo_web` de esa base usando datos ficticios; nunca apuntarla al entorno real:

```sh
TEST_DATABASE_URL=postgresql://localhost/ssro_test_security npm test
```

Sin `TEST_DATABASE_URL`, se ejecutan las pruebas de regresión y se indica que la suite de PostgreSQL fue omitida.
