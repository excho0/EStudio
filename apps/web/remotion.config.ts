import { Config } from "@remotion/cli/config";
import path from "path";

Config.setEntryPoint("src/remotion/index.tsx");
Config.overrideWebpackConfig((currentConfiguration) => {
  return {
    ...currentConfiguration,
    resolve: {
      ...(currentConfiguration.resolve ?? {}),
      alias: {
        ...(currentConfiguration.resolve?.alias ?? {}),
        "@": path.resolve(process.cwd(), "src"),
      },
    },
  };
});
