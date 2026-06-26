{
  pkgs,
  lib,
  config,
  inputs,
  ...
}:

{
  # https://devenv.sh/basics/
  # env.GREET = "devenv";

  # https://devenv.sh/packages/
  packages = with pkgs; [
    nodejs_22
    corepack_22
    ffmpeg
    python3
  ];

  env.LD_LIBRARY_PATH = pkgs.lib.makeLibraryPath [
    pkgs.util-linux
  ];

  # https://devenv.sh/languages/
  # languages.c.enable = true; # some dependencies need it

  # https://devenv.sh/processes/
  # processes.dev.exec = "${lib.getExe pkgs.watchexec} -n -- ls -la";

  # https://devenv.sh/services/
  services.postgres = {
    enable = true;
    extensions = exts: with exts; [
      pgroonga
    ];
    initialDatabases = [
      { name = "sharkey"; user = "sharkey"; pass = "examplepasswordhere"; }
    ];
    initialScript = ''
      ALTER ROLE sharkey SUPERUSER;
    '';
  };

  services.redis.enable = true;

  # https://devenv.sh/scripts/
  scripts.hello.exec = ''
    echo hello from $GREET
  '';

  # https://devenv.sh/basics/
  enterShell = ''
    echo "welcome!"
  '';

  # https://devenv.sh/tasks/
  # tasks = {
  #   "myproj:setup".exec = "mytool build";
  #   "devenv:enterShell".after = [ "myproj:setup" ];
  # };

  # https://devenv.sh/tests/
  enterTest = ''
    echo "Running tests"
    git --version | grep --color=auto "${pkgs.git.version}"
  '';

  # https://devenv.sh/git-hooks/
  # git-hooks.hooks.shellcheck.enable = true;

  # See full reference at https://devenv.sh/reference/options/

  files.".config/default.yml".yaml = let 
    port = 3000;
  in {
    url = "http://localhost:${toString port}";
    port = port;
    address = "127.0.0.1";
    db = {
      host = config.env.PGHOST;
      port = config.env.PGPORT;
      user = "sharkey";
      pass = "examplepasswordhere";
    };
    dbReplications = false;
    redis = {
      host = "localhost";
      port = 6379;
    };
    fulltextSearch.provider = "sqlPgroonga";
    id = "aidx";
  };
}
