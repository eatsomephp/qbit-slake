# syntax=docker/dockerfile:1
# linuxserver.io Docker mod: DOCKER_MODS=ghcr.io/eatsomephp/qbit-slake-lsio-mod:latest
# Ships a Slake release at /qbit-slake and enables it on container start.

FROM --platform=$BUILDPLATFORM alpine:3 AS buildstage
ARG SLAKE_REPO
ARG SLAKE_VERSION
RUN apk add --no-cache curl unzip \
 && mkdir -p /root-layer \
 && curl -fsSL -o /tmp/qbit-slake.zip \
      "https://github.com/${SLAKE_REPO}/releases/download/v${SLAKE_VERSION}/qbit-slake-${SLAKE_VERSION}.zip" \
 && unzip -q /tmp/qbit-slake.zip -d /root-layer/
COPY root/ /root-layer/

FROM scratch
LABEL maintainer="qbit-slake"
COPY --from=buildstage /root-layer/ /
