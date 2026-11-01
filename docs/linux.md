# Streamlabs Desktop on Linux

This fork runs Streamlabs Desktop on Linux (x64). Streamlabs does not publish
Linux builds of the native modules, so the OBS backend is built locally.

| Part                                   | Where it comes from                                                                                                         |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| App (Electron, TypeScript)             | this repository, branch `linux-port`                                                                                        |
| obs-studio-node (`obs64` + Node addon) | [DevGnott/obs-studio-node](https://github.com/DevGnott/obs-studio-node), branch `linux-port`                                |
| lib-streamlabs-ipc                     | [DevGnott/lib-streamlabs-ipc](https://github.com/DevGnott/lib-streamlabs-ipc), branch `linux-port` (submodule of the above) |
| libobs + plugins                       | [stream-labs/obs-studio](https://github.com/stream-labs/obs-studio) tag `32.1.1sl21` plus `scripts/linux/obs-studio.patch`  |

## Requirements

Tested on Ubuntu 24.04. Other distributions need the equivalent packages.

```sh
sudo apt install build-essential cmake ninja-build pkg-config git curl \
  extra-cmake-modules libavcodec-dev libavdevice-dev libavfilter-dev libavformat-dev \
  libavutil-dev libswresample-dev libswscale-dev libx264-dev libcurl4-openssl-dev \
  libmbedtls-dev libgl1-mesa-dev libglvnd-dev libgles2-mesa-dev libegl1-mesa-dev \
  libjansson-dev libx11-dev libx11-xcb-dev libxcb1-dev libxcb-randr0-dev libxcb-shm0-dev \
  libxcb-xinerama0-dev libxcb-composite0-dev libxcb-xfixes0-dev libxcomposite-dev \
  libxinerama-dev libxrandr-dev libxss-dev libwayland-dev libxkbcommon-dev libdrm-dev \
  libva-dev libpci-dev libpipewire-0.3-dev uthash-dev libsimde-dev nlohmann-json3-dev \
  libwebsocketpp-dev libasio-dev librist-dev libsrt-openssl-dev libvpl-dev \
  libasound2-dev libpulse-dev libjack-jackd2-dev libsndio-dev libspeexdsp-dev \
  libfdk-aac-dev libfontconfig-dev libfreetype6-dev libudev-dev libv4l-dev libvlc-dev \
  libssl-dev zlib1g-dev fontconfig
```

You also need Node.js and Yarn (via `corepack enable`) as described in the main README.

## Build

```sh
git clone -b linux-port https://github.com/DevGnott/slobsLinux.git
cd slobsLinux
yarn install
scripts/linux/build-native.sh        # libobs + obs-studio-node, takes a while
yarn compile
yarn start
```

`build-native.sh` clones and builds everything in `~/slobs-linux-build` (pass
another directory as the first argument) and copies the result into
`node_modules/obs-studio-node`. Run it again after `yarn install` if that
directory was removed.

Do not use `/usr` or `/usr/local` as the libobs prefix. libobs also looks for
plugins in its install prefix, and a distribution OBS installed there would be
loaded alongside ours.

### Realm

`yarn install` downloads a Linux prebuild of Realm (`realm@12`) from
`static.realm.io`. If that download fails, the app stops at start with
`Cannot find module .../realm/binding/build/realm.node`. In that case build
Realm from source (see the realm-js repository, tag `v12.7.1`) and copy
`realm.node` to `node_modules/realm/binding/build/`.

## Runtime notes

- **X11 is required.** OBS previews are embedded as X11 child windows rendered
  with EGL, so Electron is started with `--ozone-platform=x11`. On Wayland
  desktops this runs through XWayland. Screen capture of Wayland sessions works
  through the PipeWire sources.
- **Virtual camera** needs the v4l2loopback kernel module:
  `sudo modprobe v4l2loopback exclusive_caps=1 card_label="Streamlabs Desktop"`
- **Fonts** for text sources are listed with fontconfig (`fc-list`).
- **Auto-update is disabled.** The app always uses the locally compiled bundles.

## Known limitations

- No browser sources, alert box widgets or other CEF based features (obs-browser
  is not built for Linux yet).
- No global hotkeys yet (`node-libuiohook` has no Linux build). The app starts
  without them.
- No crash reporting (crashpad / crash-handler).
- No NDI, game overlay or NVENC/QSV encoders. x264 works; VAAPI comes with
  obs-ffmpeg but has not been tested yet.
- The Streamlabs web login link only knows Windows and macOS, so the app
  reports itself as Windows there.

## Source types on Linux

| Purpose                           | OBS source                                                          |
| --------------------------------- | ------------------------------------------------------------------- |
| Webcam                            | `v4l2_input`, `pipewire-camera-source`                              |
| Microphone / desktop audio        | `pulse_input_capture`, `pulse_output_capture`, `alsa_input_capture` |
| Screen / window capture (X11)     | `xshm_input`, `xcomposite_input`                                    |
| Screen / window capture (Wayland) | `pipewire-screen-capture-source`, `pipewire-window-capture-source`  |
| Text                              | `text_ft2_source`                                                   |
