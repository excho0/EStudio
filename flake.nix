{
  description = "Excho Engine dev shell";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs { inherit system; };
    in
    {
      devShells.${system}.default = pkgs.mkShell {
        packages = with pkgs; [
          nodejs_20
          pnpm
          chromium
        ];

        buildInputs = with pkgs; [
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
          mesa
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

        REMOTION_BROWSER_EXECUTABLE = "${pkgs.chromium}/bin/chromium";
      };
    };
}
