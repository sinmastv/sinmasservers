#!/bin/bash
set -e
cd /mnt/server
mkdir -p data/{config,music,playlists,logs,.uploads}
cat > README-FIRST.txt <<'TXT'
Icecast AutoDJ v2

1. El puerto principal del servidor Pterodactyl es el PANEL WEB.
2. Añade dos allocations extra al servidor:
   - uno para ICECAST_PORT (oyentes/source Icecast)
   - otro para LIVE_PORT (entrada Liquidsoap Harbor para DJs)
3. Configura ICECAST_PORT y LIVE_PORT en las variables del Egg con esos mismos puertos.
4. Arranca el servidor y abre el puerto principal en el navegador.
5. En el primer acceso crearás la cuenta PROPIETARIO. No hay credenciales por defecto.

Los datos persistentes están en /home/container/data.
TXT
chmod -R u+rwX,go-rwx data || true
