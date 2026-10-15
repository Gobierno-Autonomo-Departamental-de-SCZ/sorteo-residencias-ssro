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
