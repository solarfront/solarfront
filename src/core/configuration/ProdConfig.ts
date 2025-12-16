import { GameEnv } from "./Config";
import { DefaultServerConfig } from "./DefaultConfig";

export const prodConfig = new (class extends DefaultServerConfig {
  numWorkers(): number {
    return 6; //DEFAULT: 10
  }
  env(): GameEnv {
    return GameEnv.Prod;
  }
  gameCreationRate(): number {
    return 60 * 1000; // 60 seconds (1 minute)
  }
  jwtAudience(): string {
    return "solarfront.io";
  }
})();
