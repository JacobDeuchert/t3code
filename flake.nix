{
  description = "T3 Code development shell (NixOS / nix-ld)";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      nixpkgs,
      flake-utils,
      ...
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = nixpkgs.legacyPackages.${system};

        # Shared objects the prebuilt Electron binary (and Chromium's helper
        # processes) dlopen at runtime. node_modules/electron/dist/electron is a
        # foreign binary, so nix-ld resolves them from NIX_LD_LIBRARY_PATH.
        # These are library-path entries only -- never add them to `packages`,
        # or their -dev outputs start competing with stdenv's include paths.
        electronRuntimeLibs = with pkgs; [
          stdenv.cc.cc.lib
          glib
          nss
          nspr
          atk
          at-spi2-atk
          at-spi2-core
          cups
          dbus
          expat
          libdrm
          libgbm
          libGL
          libxkbcommon
          libsecret
          gtk3
          pango
          cairo
          gdk-pixbuf
          alsa-lib
          systemdLibs # libudev
          vulkan-loader
          libx11
          libxcomposite
          libxcursor
          libxdamage
          libxext
          libxfixes
          libxi
          libxrandr
          libxrender
          libxscrnsaver
          libxtst
          libxcb
          libxshmfence
        ];

        libraryPath = pkgs.lib.makeLibraryPath electronRuntimeLibs;
      in
      {
        devShells.default = pkgs.mkShell {
          name = "t3code";

          # mkShell's stdenv already provides the wrapped cc/c++ that node-gyp
          # needs; adding pkgs.gcc here would shadow it and break header lookup.
          packages = with pkgs; [
            nodejs_24
            pnpm
            python3
            pkg-config
            gnumake
            cargo
            rustc
            git
            curl
            unzip
          ];

          # nix-ld: the loader baked into the downloaded Electron binary points at
          # /lib64/ld-linux-x86-64.so.2, which NixOS provides via nix-ld. It reads
          # these two variables to find a real glibc and the libs above.
          NIX_LD = "${pkgs.stdenv.cc.bintools.dynamicLinker}";
          NIX_LD_LIBRARY_PATH = libraryPath;

          # Chromium spawns its helper processes itself; keep the same set on the
          # normal loader path so those children resolve their libs too.
          LD_LIBRARY_PATH = libraryPath;

          shellHook = ''
            export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

            # Silences "g_settings_schema_source_lookup: assertion 'source != NULL'
            # failed" -- GTK looks for compiled GSettings schemas on XDG_DATA_DIRS.
            export XDG_DATA_DIRS="${pkgs.gsettings-desktop-schemas}/share/gsettings-schemas/${pkgs.gsettings-desktop-schemas.name}:${pkgs.gtk3}/share/gsettings-schemas/${pkgs.gtk3.name}:$XDG_DATA_DIRS"

            echo "t3code devshell: node $(node --version), pnpm $(pnpm --version)"
            echo "  pnpm install && pnpm dev:desktop"
          '';
        };
      }
    );
}
