FROM savonet/liquidsoap:v2.4.5

USER root
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl xz-utils nodejs npm build-essential pkg-config \
    libxml2-dev libxslt1-dev libogg-dev libvorbis-dev libtheora-dev libspeex-dev \
    libcurl4-openssl-dev libssl-dev libkate-dev libtool autoconf automake \
 && curl -fsSL https://downloads.xiph.org/releases/icecast/icecast-2.5.0.tar.gz -o /tmp/icecast.tar.gz \
 && tar -xzf /tmp/icecast.tar.gz -C /tmp \
 && cd /tmp/icecast-2.5.0 \
 && ./configure --prefix=/usr/local \
 && make -j"$(nproc)" \
 && make install \
 && cd / \
 && rm -rf /tmp/icecast* \
 && apt-get purge -y build-essential pkg-config libxml2-dev libxslt1-dev libogg-dev libvorbis-dev libtheora-dev libspeex-dev libcurl4-openssl-dev libssl-dev libkate-dev libtool autoconf automake \
 && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/*

RUN id container >/dev/null 2>&1 || useradd -m -d /home/container -s /bin/bash container
WORKDIR /opt/icecast-autodj
COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY app ./app
RUN mkdir -p /home/container && chown -R container:container /home/container /opt/icecast-autodj
USER container
WORKDIR /home/container
CMD ["node","/opt/icecast-autodj/app/server.js"]
