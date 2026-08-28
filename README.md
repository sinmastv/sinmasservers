# Icecast AutoDJ v2 — Pterodactyl

Pack completo para Pterodactyl basado en Icecast 2.5.0 + Liquidsoap 2.4.5 + panel web propio.

## Qué incluye
- `Dockerfile`: construye la imagen completa con Icecast, Liquidsoap, Node.js y el panel.
- `INSTALL-WINGS.sh`: instala/construye automáticamente la imagen necesaria en el nodo Wings.
- `UPDATE-WINGS.sh`: reconstruye la imagen para futuras actualizaciones sin tocar `/home/container/data`.
- `egg-icecast-autodj-v2.json`: Egg PTDL_v2 listo para importar.
- `app/`: panel y controlador de radio.
- `scripts/install.sh`: prepara el espacio persistente del servidor al instalar/reinstalar desde Pterodactyl.

## Instalación en el nodo Wings
Descomprime este pack en cualquier carpeta del nodo y ejecuta una sola vez:

```bash
sudo ./INSTALL-WINGS.sh
```

El instalador comprueba Docker, construye `sinmas/icecast-autodj-v2:1.0.0` y verifica que quede disponible para Wings.

Después importa `egg-icecast-autodj-v2.json` en Pterodactyl.

> El Egg no puede instalar una nueva imagen Docker directamente sobre el host por diseño de seguridad: el instalador del Egg se ejecuta dentro de un contenedor aislado y no debe tener acceso a `/var/run/docker.sock`. Por eso el pack incluye `INSTALL-WINGS.sh` para hacer esa preparación de forma segura en el nodo.

## Puertos
El servidor necesita 3 allocations:
1. Principal (`SERVER_PORT`): panel web.
2. `ICECAST_PORT`: salida Icecast/oyentes.
3. `LIVE_PORT`: entrada Live DJ de Liquidsoap.

## Primer acceso
Abre `http://IP:PUERTO_PANEL`. Si aún no existe propietario, el asistente obliga a crear la cuenta PROPIETARIO. No hay credenciales predeterminadas.

## Persistencia
Todo lo importante queda bajo `/home/container/data`:
- `data/panel.json`: ajustes y cuenta propietaria hasheada.
- `data/music`: biblioteca.
- `data/playlists`: playlists.
- `data/config`: Icecast/Liquidsoap generados.
- `data/logs`: logs.

Reinstalar o actualizar la imagen no debe borrar estos datos.
