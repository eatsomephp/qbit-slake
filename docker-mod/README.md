# Slake linuxserver.io Docker mod

Adds Slake to [linuxserver/qbittorrent](https://docs.linuxserver.io/images/docker-qbittorrent)
and turns it on at container start.

```yaml
services:
  qbittorrent:
    image: lscr.io/linuxserver/qbittorrent:latest
    environment:
      - DOCKER_MODS=ghcr.io/eatsomephp/qbit-slake-lsio-mod:latest
```

On start the mod sets `AlternativeUIEnabled=true` and `RootFolder=/qbit-slake` under `[WebUI]` in
`/config/qBittorrent/qBittorrent.conf`. To keep the files but manage the setting yourself,
add `SLAKE_DISABLE=true`. To go back to the built-in WebUI, remove the mod and untick
**Use alternative WebUI** (or set `AlternativeUIEnabled=false` under `[WebUI]`).

For a custom theme, copy `theme.example.css` from a release into your config volume as
`/config/qbit-slake-theme.css` and edit it. The mod copies it into place on every container
start, so restart the container after changing it.

The image is built by `.github/workflows/docker-mod.yml` for each release.
