{
  description = "T3 Code development shell and desktop package (NixOS / nix-ld)";

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

        inherit (pkgs) lib;

        # The desktop app reads its own version out of this manifest at runtime
        # (branding, update channel), so the derivation follows the same source.
        desktopVersion = (lib.importJSON ./apps/desktop/package.json).version;

        # Optional at runtime -- resolveResourceMonitorPath returns Option.none
        # when the binary is absent -- but cheap enough to always ship.
        resourceMonitor = pkgs.rustPlatform.buildRustPackage {
          pname = "t3-resource-monitor";
          version = (lib.importTOML ./native/resource-monitor/Cargo.toml).package.version;
          src = ./native/resource-monitor;
          cargoLock.lockFile = ./native/resource-monitor/Cargo.lock;
        };

        # Dependency resolution depends only on the manifests, so keying the
        # (slow) fetch on those keeps app-code edits from invalidating it.
        # `./.` is the flake source, so gitignored node_modules/dist are already
        # excluded and this filter never walks them.
        dependencyManifests = lib.fileset.toSource {
          root = ./.;
          fileset = lib.fileset.unions [
            ./pnpm-lock.yaml
            ./pnpm-workspace.yaml
            ./patches
            (lib.fileset.fileFilter (file: file.name == "package.json") ./.)
          ];
        };

        # The trailing `...` pulls in each project's workspace dependencies,
        # which is what keeps apps/mobile's React Native tree out of the
        # closure. The root project carries the build toolchain (vite-plus,
        # effect-tsgo), so it has to be selected explicitly.
        # apps/server's build runs `node scripts/cli.ts build`, which imports
        # from the scripts project, so its dependencies are build inputs too.
        desktopWorkspaces = [
          "@t3tools/monorepo"
          "@t3tools/desktop..."
          "t3..."
          "@t3tools/scripts..."
        ];

        desktop = pkgs.stdenv.mkDerivation (finalAttrs: {
          pname = "t3code";
          version = desktopVersion;
          src = ./.;

          pnpmDeps = pkgs.pnpm_11.fetchDeps {
            inherit (finalAttrs) pname version pnpmWorkspaces;
            src = dependencyManifests;
            # 4 is the lowest version pnpm_11 still accepts.
            fetcherVersion = 4;
            hash = "sha256-T4Av+63TauvUxokF9hogiWGoC1laITqAvku7Jxm2plg=";
          };
          pnpmWorkspaces = desktopWorkspaces;

          nativeBuildInputs = [
            pkgs.nodejs_24
            pkgs.pnpm_11
            pkgs.pnpm_11.configHook
            pkgs.writableTmpDirAsHomeHook
            pkgs.python3
            # `vp config` shells out to git.
            pkgs.git
            pkgs.makeWrapper
            pkgs.copyDesktopItems
            pkgs.autoPatchelfHook
          ];

          # Prebuilt .node/.so files that ship inside npm tarballs are ordinary
          # foreign binaries; the ones we never load must not fail the build.
          buildInputs = [ pkgs.stdenv.cc.cc.lib ];
          autoPatchelfIgnoreMissingDeps = true;

          env = {
            # electron's postinstall would fetch a binary from the network. The
            # app runs against nixpkgs' electron instead (see the wrapper).
            ELECTRON_SKIP_BINARY_DOWNLOAD = "1";
            # node-gyp resolves headers from here instead of downloading them.
            npm_config_nodedir = "${pkgs.nodejs_24}";
            # vite-plus builds an HTTP client while starting up and aborts if it
            # loads no CA certificates -- the sandbox's default SSL_CERT_FILE
            # points at a file that does not exist. This only satisfies that
            # initialization; the sandbox still allows no network.
            SSL_CERT_FILE = "${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt";
          };

          # pnpmConfigHook installs with --ignore-scripts, so the two things a
          # normal `pnpm install` would do have to happen explicitly: compile
          # node-pty (its tarball ships prebuilds for win32/darwin only) and run
          # the repo's `prepare` steps.
          preBuild = ''
            # -r is required: node-pty belongs to apps/server, so a rebuild
            # scoped to the root project matches nothing and exits successfully.
            pnpm rebuild -r node-pty
            # That no-op is otherwise invisible until the server process dies at
            # runtime with NodePtyModuleLoadError, so assert the output exists.
            if ! ls node_modules/.pnpm/node-pty@*/node_modules/node-pty/build/Release/pty.node >/dev/null 2>&1; then
              echo "ERROR: node-pty was not compiled; the server backend would fail to start." >&2
              exit 1
            fi
            node scripts/clean-tsgo-backups.mjs
            pnpm exec effect-tsgo patch
            pnpm exec vp config --no-agent
          '';

          buildPhase = ''
            runHook preBuild
            pnpm build:desktop
            runHook postBuild
          '';

          installPhase = ''
            runHook preInstall

            # electron-builder ships the monorepo root as the app, and
            # DesktopEnvironment derives rootDir as ../../.. from the directory
            # holding main.cjs -- so the layout has to survive verbatim, with
            # node_modules copied as-is to keep pnpm's symlink farm intact.
            mkdir -p $out/share/t3code
            cp -a apps node_modules packages scripts package.json pnpm-workspace.yaml \
              $out/share/t3code/
            # Not part of the desktop closure; only bloat in the store.
            rm -rf $out/share/t3code/apps/{mobile,marketing}
            # Mirrors DESKTOP_FILE_EXCLUSIONS: T3 Code always hands the SDK the
            # user's own Claude executable, so the ~75MB executable the SDK
            # bundles for this platform is dead weight. Its optional-dependency
            # links have to go with it, or noBrokenSymlinks fails the build.
            rm -rf $out/share/t3code/node_modules/.pnpm/@anthropic-ai+claude-agent-sdk-*
            find $out/share/t3code -xtype l -name 'claude-agent-sdk-*' -delete

            # Unpacked builds look for it here (resolveResourcePathCandidates).
            install -Dm755 ${resourceMonitor}/bin/t3-resource-monitor \
              $out/share/t3code/apps/desktop/prod-resources/resource-monitor/t3-resource-monitor

            install -Dm644 apps/desktop/resources/icon.png \
              $out/share/icons/hicolor/512x512/apps/t3code.png

            # Pointing electron at the directory (not main.cjs) is what makes it
            # read apps/desktop/package.json, so appPath/version resolve the way
            # the app expects. node stays on PATH for the spawned server backend.
            makeWrapper ${pkgs.electron}/bin/electron $out/bin/t3code \
              --add-flags $out/share/t3code/apps/desktop \
              --prefix PATH : ${lib.makeBinPath [ pkgs.nodejs_24 pkgs.git ]}

            runHook postInstall
          '';

          desktopItems = [
            (pkgs.makeDesktopItem {
              name = "t3code";
              exec = "t3code %U";
              icon = "t3code";
              desktopName = "T3 Code (Alpha)";
              genericName = "AI coding agent";
              categories = [ "Development" ];
              startupWMClass = "t3code";
              # Lets browsers hand t3code:// OAuth callbacks back to the app.
              mimeTypes = [
                "x-scheme-handler/t3code"
                "x-scheme-handler/t3code-dev"
              ];
            })
          ];

          meta = {
            description = "T3 Code desktop app";
            mainProgram = "t3code";
            platforms = lib.platforms.linux;
          };
        });
      in
      {
        packages = {
          inherit desktop;
          resource-monitor = resourceMonitor;
          default = desktop;
        };

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
