import { GameEnv } from "./Config";
import { DefaultServerConfig } from "./DefaultConfig";

export const preprodConfig = new (class extends DefaultServerConfig {
  env(): GameEnv {
    return GameEnv.Preprod;
  }
  numWorkers(): number {
    return 2;
  }
  gameCreationRate(): number {
    return 60 * 1000; // 60 seconds (1 minute)
  }
  jwtAudience(): string {
    return "openfront.dev";
  }
})();
