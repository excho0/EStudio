{ config, lib, pkgs, ... }:
let
  cfg = config.services.estudio.compose;

  # Resolve a compose file path: absolute paths are used as-is,
  # relative paths are resolved under repoPath.
  resolveComposeFile = file:
    if lib.hasPrefix "/" file then file else "${cfg.repoPath}/${file}";

  resolvedComposeFiles = map resolveComposeFile cfg.composeFiles;

  # Build command arguments once and reuse for start/stop scripts.
  composeFileArgs = lib.concatMapStringsSep " " (f: "-f ${lib.escapeShellArg f}") resolvedComposeFiles;
  projectArg = lib.optionalString (cfg.projectName != null)
    "--project-name ${lib.escapeShellArg cfg.projectName}";
  extraArgs = lib.concatStringsSep " " cfg.extraArgs;

  upArgs =
    lib.concatStringsSep " " ([
      composeFileArgs
      projectArg
      "up -d"
    ]
    ++ lib.optional cfg.pullOnStart "--pull always"
    ++ lib.optional cfg.buildOnStart "--build"
    ++ lib.optional cfg.removeOrphans "--remove-orphans"
    ++ lib.optional (extraArgs != "") extraArgs);

  downArgs =
    lib.concatStringsSep " " ([
      composeFileArgs
      projectArg
      "down"
      "--remove-orphans"
    ] ++ lib.optional (extraArgs != "") extraArgs);

  # Use dedicated tools for each runtime.
  # Docker: docker compose (v2 plugin)
  # Podman: podman-compose binary
  runtimeInputs =
    if cfg.runtime == "podman"
    then [ pkgs.podman pkgs.podman-compose pkgs.coreutils pkgs.bash ]
    else [ pkgs.docker pkgs.coreutils pkgs.bash ];

  runtimeExec =
    if cfg.runtime == "podman"
    then "${pkgs.podman-compose}/bin/podman-compose"
    else "${pkgs.docker}/bin/docker compose";

  composeUpScript = pkgs.writeShellApplication {
    name = "estudio-compose-up";
    inherit runtimeInputs;
    text = ''
      set -euo pipefail
      cd ${lib.escapeShellArg cfg.repoPath}
      exec ${runtimeExec} ${upArgs}
    '';
  };

  composeDownScript = pkgs.writeShellApplication {
    name = "estudio-compose-down";
    inherit runtimeInputs;
    text = ''
      set -euo pipefail
      cd ${lib.escapeShellArg cfg.repoPath}
      exec ${runtimeExec} ${downArgs}
    '';
  };
in
{
  options.services.estudio.compose = {
    enable = lib.mkEnableOption "EStudio compose stack as a systemd-managed service";

    runtime = lib.mkOption {
      type = lib.types.enum [ "docker" "podman" ];
      default = "docker";
      description = ''
        Container runtime for compose execution.
        - `docker`: uses `docker compose`
        - `podman`: uses `podman-compose`
      '';
    };

    repoPath = lib.mkOption {
      type = lib.types.str;
      default = "/srv/estudio";
      example = "/srv/estudio";
      description = "Absolute path to the EStudio repository containing compose files.";
    };

    dataRoot = lib.mkOption {
      type = lib.types.str;
      default = "${cfg.repoPath}/data";
      example = "/var/lib/estudio";
      description = ''
        Root directory for persistent compose-mounted data.
        This value is passed to compose as `ESTUDIO_DATA_ROOT`.
      '';
    };

    composeFiles = lib.mkOption {
      type = lib.types.listOf lib.types.str;
      default = [ "docker-compose.yml" ];
      example = [ "docker-compose.yml" "docker-compose.nvidia.yml" ];
      description = ''
        Compose files in merge order. Relative values are resolved from `repoPath`.
      '';
    };

    projectName = lib.mkOption {
      type = lib.types.nullOr lib.types.str;
      default = null;
      example = "estudio";
      description = ''
        Optional compose project name override. When null, compose decides project name
        from the compose `name:` field or directory name.
      '';
    };

    pullOnStart = lib.mkOption {
      type = lib.types.bool;
      default = false;
      description = "Run compose startup with image pull (`--pull always`).";
    };

    buildOnStart = lib.mkOption {
      type = lib.types.bool;
      default = false;
      description = "Run compose startup with build (`--build`).";
    };

    removeOrphans = lib.mkOption {
      type = lib.types.bool;
      default = true;
      description = "Remove orphan services during compose startup.";
    };

    extraArgs = lib.mkOption {
      type = lib.types.listOf lib.types.str;
      default = [ ];
      example = [ "--ansi=never" ];
      description = "Additional raw arguments appended to both up/down commands.";
    };

    environmentFiles = lib.mkOption {
      type = lib.types.listOf lib.types.path;
      default = [ ];
      example = [ "/run/secrets/estudio-compose.env" ];
      description = ''
        Optional systemd `EnvironmentFile=` entries loaded for the compose unit.
      '';
    };
  };

  config = lib.mkIf cfg.enable {
    assertions = [
      {
        assertion = cfg.composeFiles != [ ];
        message = "services.estudio.compose.composeFiles must contain at least one compose file.";
      }
      {
        assertion = lib.hasPrefix "/" cfg.repoPath;
        message = "services.estudio.compose.repoPath must be an absolute path.";
      }
      {
        assertion = builtins.pathExists cfg.repoPath;
        message = "services.estudio.compose.repoPath does not exist: ${cfg.repoPath}";
      }
      {
        assertion = lib.hasPrefix "/" cfg.dataRoot;
        message = "services.estudio.compose.dataRoot must be an absolute path.";
      }
      {
        assertion = builtins.all builtins.pathExists resolvedComposeFiles;
        message = "One or more compose files do not exist under repoPath: ${toString resolvedComposeFiles}";
      }
      {
        assertion = builtins.all builtins.pathExists cfg.environmentFiles;
        message = "One or more services.estudio.compose.environmentFiles entries do not exist.";
      }
      {
        assertion = cfg.runtime != "docker" || config.virtualisation.docker.enable;
        message = "services.estudio.compose.runtime = \"docker\" requires virtualisation.docker.enable = true.";
      }
      {
        assertion = cfg.runtime != "podman" || config.virtualisation.podman.enable;
        message = "services.estudio.compose.runtime = \"podman\" requires virtualisation.podman.enable = true.";
      }
    ];

    systemd.services.estudio-compose = {
      description = "EStudio Compose Stack";

      after =
        [ "network-online.target" ]
        ++ lib.optional (cfg.runtime == "docker") "docker.service"
        ++ lib.optional (cfg.runtime == "podman") "podman.service";

      wants =
        [ "network-online.target" ]
        ++ lib.optional (cfg.runtime == "docker") "docker.service"
        ++ lib.optional (cfg.runtime == "podman") "podman.service";

      wantedBy = [ "multi-user.target" ];

      serviceConfig = {
        Type = "oneshot";
        RemainAfterExit = true;
        WorkingDirectory = cfg.repoPath;
        ExecStart = "${composeUpScript}/bin/estudio-compose-up";
        ExecStop = "${composeDownScript}/bin/estudio-compose-down";
        Environment = [
          "ESTUDIO_DATA_ROOT=${cfg.dataRoot}"
        ];
        EnvironmentFile = cfg.environmentFiles;
      };
    };
  };
}
