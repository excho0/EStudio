{
  description = "Excho Engine dev shell";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs { inherit system; };
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
    in
    {
      devShells.${system}.default = pkgs.mkShell {
        packages = with pkgs; [
          nodejs_20
          pnpm
          chromium
          chromiumXvfb
          mesa-demos
          vulkan-tools
          xvfb-run
        ];

        buildInputs = glRuntimeLibs;

        REMOTION_BROWSER_EXECUTABLE = "${chromiumXvfb}/bin/chromium-xvfb";
        REMOTION_RENDER_BROWSER_EXECUTABLE = "${chromiumXvfb}/bin/chromium-xvfb";
        REMOTION_RENDER_GL = "angle";
        LIBGL_DRIVERS_PATH = "${pkgs.mesa}/lib/dri";
        __EGL_VENDOR_LIBRARY_DIRS = "${pkgs.mesa}/share/glvnd/egl_vendor.d";
        VK_ICD_FILENAMES = "${pkgs.mesa}/share/vulkan/icd.d/lvp_icd.x86_64.json:${pkgs.mesa}/share/vulkan/icd.d/radeon_icd.x86_64.json:${pkgs.mesa}/share/vulkan/icd.d/intel_icd.x86_64.json";
        LD_LIBRARY_PATH = pkgs.lib.makeLibraryPath glRuntimeLibs;
      };
    };
}
