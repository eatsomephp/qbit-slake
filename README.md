# Slake

A fast, keyboard-driven, alternative WebUI for qBittorrent 5+

![Slake](public/screenshots/wide.png)

## Features

- Fast with thousands of torrents
- Static assets, no separate process
- Saved filter views, plus conditions like `ratio>2` or `size>=100GiB`
- Vim-style keymaps with which-key and a cheat sheet (`?`)
- Mobile layout, installable as a PWA
- Themes: [Rosé Pine](https://rosepinetheme.com) (main, Moon), [Catppuccin](https://catppuccin.com) (Mocha, Macchiato, Frappé), [Gruvbox](https://github.com/morhetz/gruvbox) (medium, hard, soft), [Kanagawa](https://github.com/rebelot/kanagawa.nvim) (Wave, Dragon), [Tokyo Night](https://github.com/folke/tokyonight.nvim) (Night, Storm, Moon), or your own `theme.css`, each with a light mode

<p align="center">
  <img src="public/screenshots/narrow.png" width="260" alt="Slake on mobile">
  <img src="public/screenshots/narrow-light.png" width="260" alt="Slake on mobile, light theme">
</p>

## Install

### Script

Downloads the latest release into `~/.local/share/qbit-slake`. Rerun to update.

```sh
tmp=$(mktemp -d) \
&& curl -fsSL -o "$tmp/slake.zip" \
  https://github.com/eatsomephp/qbit-slake/releases/latest/download/qbit-slake.zip \
&& unzip -q "$tmp/slake.zip" -d "$tmp" \
&& mkdir -p ~/.local/share \
&& rm -rf ~/.local/share/qbit-slake \
&& mv "$tmp/qbit-slake" ~/.local/share/ \
&& rm -rf "$tmp" \
&& echo "$HOME/.local/share/qbit-slake"
```

Then point **Options → WebUI → Use alternative WebUI** at the printed path (qBittorrent doesn't expand `~`).

### Manual

Download `qbit-slake-<version>.zip` from [Releases](../../releases), unzip it anywhere, and point **Use alternative WebUI** at the `qbit-slake` folder.

### linuxserver.io Docker

For [linuxserver/qbittorrent](https://docs.linuxserver.io/images/docker-qbittorrent). The [Docker mod](docker-mod/README.md) installs Slake and enables the alternative WebUI on container start.

```yaml
environment:
  - DOCKER_MODS=ghcr.io/eatsomephp/qbit-slake-lsio-mod:latest
```

### Custom theme

Copy `theme.example.css` to `theme.css` in `qbit-slake/public/` and edit. Unset variables fall back to the default theme.

## Development

```sh
pnpm install
pnpm dev:demo     # mock backend with fake torrents
pnpm dev:docker   # start with qBittorent Docker as backend
pnpm dev          # use existing qBittorent (VITE_QBT_TARGET)
```

`pnpm build` outputs to `qbit-slake/`.
`pnpm preview:demo` serves a demo build at http://localhost:4173.

## License

[GPL-3.0-or-later](LICENSE)
