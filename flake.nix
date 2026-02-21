{
  description = "EStudio monorepo dev shell (web + captions api)";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs {
        inherit system;
        config.allowUnfree = true;
      };
      enableCuda = true;
      chromiumXvfb = pkgs.writeShellScriptBin "chromium-xvfb" ''
        exec ${pkgs.xvfb-run}/bin/xvfb-run -a -s "-screen 0 1920x1080x24" \
          ${pkgs.chromium}/bin/chromium \
          --use-gl=angle \
          --disable-gpu-sandbox \
          "$@"
      '';

      glRuntimeLibs = with pkgs; [
        nss
        atk
        at-spi2-core
        at-spi2-atk
        xorg.libX11
        xorg.libxcb
        xorg.libXcomposite
        xorg.libXrandr
        xorg.libXdamage
        xorg.libXfixes
        xorg.libXext
        xorg.libXrender
        xorg.libXcursor
        xorg.libXi
        xorg.libXScrnSaver
        xorg.libXinerama
        xorg.libXtst
        xorg.libxshmfence
        xorg.libXxf86vm
        libxkbcommon
        libdrm
        libglvnd
        mesa
        vulkan-loader
        alsa-lib
        gtk3
        glib
        dbus
        pango
        cairo
        gdk-pixbuf
        libgbm
        expat
        fontconfig
        freetype
        cups
        util-linux
      ];

      hasCudaPackages = enableCuda && builtins.hasAttr "cudaPackages" pkgs;
      cudaDevPackages =
        if hasCudaPackages then
          (with pkgs.cudaPackages; [
            cudatoolkit
            cudnn
          ])
        else
          [ ];
      cudaToolkitPath =
        if hasCudaPackages then "${pkgs.cudaPackages.cudatoolkit}" else "";

      pythonAudioLibs = with pkgs; [
        ffmpeg
        ffmpeg_7
        libsndfile
        stdenv.cc.cc.lib
      ];

      runtimeLibs = glRuntimeLibs ++ pythonAudioLibs ++ cudaDevPackages;
      runtimeLibraryPath = pkgs.lib.makeLibraryPath runtimeLibs;
      nvidiaDriverLibraryPath = "/run/opengl-driver/lib:/run/opengl-driver-32/lib";
    in
    {
      devShells.${system}.default = pkgs.mkShell {
        packages = with pkgs; [
          # Node / web app
          nodejs_20
          pnpm

          # Python / captions api
          python312
          uv

          # Build and toolchain
          git
          cmake
          gnumake
          gcc
          pkg-config

          # Browser / rendering
          chromium
          chromiumXvfb
          mesa-demos
          vulkan-tools
          xvfb-run

          # Media utilities
          ffmpeg
          ffmpeg_7
        ] ++ cudaDevPackages;

        buildInputs = runtimeLibs;

        # Remotion runtime defaults
        REMOTION_BROWSER_EXECUTABLE = "${chromiumXvfb}/bin/chromium-xvfb";
        REMOTION_RENDER_BROWSER_EXECUTABLE = "${chromiumXvfb}/bin/chromium-xvfb";
        REMOTION_RENDER_GL = "angle";
        LIBGL_DRIVERS_PATH = "${pkgs.mesa}/lib/dri";
        __EGL_VENDOR_LIBRARY_DIRS = "${pkgs.mesa}/share/glvnd/egl_vendor.d";
        VK_ICD_FILENAMES = "${pkgs.mesa}/share/vulkan/icd.d/lvp_icd.x86_64.json:${pkgs.mesa}/share/vulkan/icd.d/radeon_icd.x86_64.json:${pkgs.mesa}/share/vulkan/icd.d/intel_icd.x86_64.json";

        # CUDA discoverability for python ML stacks (whisperx/torch)
        CUDA_HOME = cudaToolkitPath;
        CUDA_PATH = cudaToolkitPath;

        LD_LIBRARY_PATH = "${runtimeLibraryPath}:${nvidiaDriverLibraryPath}";
        # Some Python native modules also check this alias.
        NIX_LD_LIBRARY_PATH = "${runtimeLibraryPath}:${nvidiaDriverLibraryPath}";

        shellHook = ''
          echo "EStudio dev shell loaded (web + captions api tooling)."
          echo "- Node: $(node --version 2>/dev/null || true)"
          echo "- Python: $(python --version 2>/dev/null || true)"
          echo "- uv: $(uv --version 2>/dev/null || true)"
        '';
      };
    };
}
