import { JWK } from "jose";
import { z } from "zod";
import {
  Difficulty,
  Duos,
  Game,
  GameMapType,
  GameMode,
  GameType,
  Gold,
  Player,
  PlayerInfo,
  PlayerType,
  TerrainType,
  TerraNullius,
  Tick,
  UnitInfo,
  UnitType,
} from "../game/Game";
import { TileRef } from "../game/GameMap";
import { PlayerView } from "../game/GameView";
import { UserSettings } from "../game/UserSettings";
import { GameConfig, GameID } from "../Schemas";
import { assertNever, simpleHash, within } from "../Util";
import { Config, GameEnv, NukeMagnitude, ServerConfig, Theme } from "./Config";
import { pastelTheme } from "./PastelTheme";
import { pastelThemeDark } from "./PastelThemeDark";

const JwksSchema = z.object({
  keys: z
    .object({
      alg: z.literal("EdDSA"),
      crv: z.literal("Ed25519"),
      kty: z.literal("OKP"),
      x: z.string(),
    })
    .array()
    .min(1),
});

export abstract class DefaultServerConfig implements ServerConfig {
  private publicKey: JWK;
  abstract jwtAudience(): string;
  jwtIssuer(): string {
    const audience = this.jwtAudience();
    return audience === "localhost"
      ? "http://localhost:8787"
      : `https://api.${audience}`;
  }
  async jwkPublicKey(): Promise<JWK> {
    if (this.publicKey) return this.publicKey;
    const jwksUrl = this.jwtIssuer() + "/.well-known/jwks.json";
    console.log(`Fetching JWKS from ${jwksUrl}`);
    const response = await fetch(jwksUrl);
    const jwks = JwksSchema.parse(await response.json());
    this.publicKey = jwks.keys[0];
    return this.publicKey;
  }
  otelEnabled(): boolean {
    const endpoint = this.otelEndpoint();
    const username = this.otelUsername();
    const password = this.otelPassword();

    return Boolean(
      endpoint &&
        endpoint !== "undefined" &&
        endpoint !== "" &&
        username &&
        username !== "undefined" &&
        username !== "" &&
        password &&
        password !== "undefined" &&
        password !== "",
    );
  }
  otelEndpoint(): string {
    return process.env.OTEL_ENDPOINT ?? "undefined";
  }
  otelUsername(): string {
    return process.env.OTEL_USERNAME ?? "undefined";
  }
  otelPassword(): string {
    return process.env.OTEL_PASSWORD ?? "undefined";
  }
  region(): string {
    if (this.env() === GameEnv.Dev) {
      return "dev";
    }
    return process.env.REGION ?? "undefined";
  }
  gitCommit(): string {
    return process.env.GIT_COMMIT ?? "undefined";
  }
  r2Endpoint(): string {
    return `https://${process.env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  }
  r2AccessKey(): string {
    return process.env.R2_ACCESS_KEY ?? "undefined";
  }
  r2SecretKey(): string {
    return process.env.R2_SECRET_KEY ?? "undefined";
  }

  r2Bucket(): string {
    return process.env.R2_BUCKET ?? "undefined";
  }

  adminHeader(): string {
    return "x-admin-key";
  }
  adminToken(): string {
    return process.env.ADMIN_TOKEN ?? "undefined";
  }
  abstract numWorkers(): number;
  abstract env(): GameEnv;
  turnIntervalMs(): number {
    return 100;
  }
  gameCreationRate(): number {
    return 60 * 1000; // 60 seconds (1 minute)
  }

  lobbyMaxPlayers(map: GameMapType, mode: GameMode): number {
    return 30;
  }

  workerIndex(gameID: GameID): number {
    return simpleHash(gameID) % this.numWorkers();
  }
  workerPath(gameID: GameID): string {
    return `w${this.workerIndex(gameID)}`;
  }
  workerPort(gameID: GameID): number {
    return this.workerPortByIndex(this.workerIndex(gameID));
  }
  workerPortByIndex(index: number): number {
    return 3001 + index;
  }
}

export class DefaultConfig implements Config {
  constructor(
    private _serverConfig: ServerConfig,
    private _gameConfig: GameConfig,
    private _userSettings: UserSettings | null,
    private _isReplay: boolean,
  ) {}
  isReplay(): boolean {
    return this._isReplay;
  }

  isMainMenu(): boolean {
    return (
      this._gameConfig.gameType === GameType.Singleplayer &&
      !this._gameConfig.gameMap
    );
  }

  samHittingChance(): number {
    return 1;  // 100% interception rate
  }

  samWarheadHittingChance(): number {
    return 1;  // 100% interception rate for MIRV warheads
  }

  traitorDefenseDebuff(): number {
    return 0.5;
  }
  traitorDuration(): number {
    return 30 * 10; // 30 seconds
  }
  spawnImmunityDuration(): Tick {
    return 5 * 10;
  }

  gameConfig(): GameConfig {
    return this._gameConfig;
  }

  serverConfig(): ServerConfig {
    return this._serverConfig;
  }

  userSettings(): UserSettings {
    if (this._userSettings === null) {
      throw new Error("userSettings is null");
    }
    return this._userSettings;
  }

  difficultyModifier(difficulty: Difficulty): number {
    switch (difficulty) {
      case Difficulty.Easy:
        return 1;
      case Difficulty.Medium:
        return 3;
      case Difficulty.Hard:
        return 9;
      case Difficulty.Impossible:
        return 18;
    }
  }

  cityPopulationIncrease(): number {
    return 250_000;
  }

  falloutDefenseModifier(falloutRatio: number): number {
    // falloutRatio is between 0 and 1
    // So defense modifier is between [5, 2.5]
    return 5 - falloutRatio * 2;
  }
  SAMCooldown(): number {
    return 75;
  }
  SiloCooldown(): number {
    return 75;
  }

  samCooldown(): number {
    return this.SAMCooldown();
  }

  defensePostRange(): number {
    return 30;
  }
  defensePostDefenseBonus(): number {
    return 5;
  }
  playerTeams(): number | typeof Duos {
    return this._gameConfig.playerTeams ?? 0;
  }

  spawnNPCs(): boolean {
    return !this._gameConfig.disableNPCs;
  }

  isUnitDisabled(unitType: UnitType): boolean {
    return this._gameConfig.disabledUnits?.includes(unitType) ?? false;
  }

  bots(): number {
    return this._gameConfig.bots;
  }
  instantBuild(): boolean {
    return this._gameConfig.instantBuild;
  }
  infiniteGold(): boolean {
    return this._gameConfig.infiniteGold;
  }
  infiniteTroops(): boolean {
    return this._gameConfig.infiniteTroops;
  }
  tradeShipGold(dist: number): Gold {
    return (10000 + 150 * Math.pow(dist, 1.1)) * 1.5;
  }
  tradeShipSpawnRate(numberOfPorts: number): number {
    return Math.round(10 * Math.pow(numberOfPorts, 0.6));
  }

  unitInfo(type: UnitType): UnitInfo {
    switch (type) {
      case UnitType.TransportShip:
        return {
          cost: () => 0,
          territoryBound: false,
        };
      case UnitType.Viper:
        return {
          cost: (p: Player) =>
            p.type() === PlayerType.Human && this.infiniteGold()
              ? 0
              : 500_000, // Quadrupled from original 125,000 (was 250,000)
          territoryBound: false,
          maxHealth: 1000,
          constructionDuration: 20, // 2 seconds * 10 ticks/sec
        };
      case UnitType.Condor:
        return {
          cost: (p: Player) =>
            p.type() === PlayerType.Human && this.infiniteGold()
              ? 0
              : 2_000_000, // Quadrupled from original 500,000 (was 1,000,000)
          territoryBound: false,
          maxHealth: 2800,
          constructionDuration: 50, // 5 seconds * 10 ticks/sec
        };
      case UnitType.Shell:
        return {
          cost: () => 0,
          territoryBound: false,
          damage: 250,
        };
      case UnitType.SAMMissile:
        return {
          cost: () => 0,
          territoryBound: false,
          damage: 300,
        };
      case UnitType.Port:
        return {
          cost: (p: Player) =>
            p.type() === PlayerType.Human && this.infiniteGold()
              ? 0
              : 250_000, // Quadrupled from original 62,500 (was 125,000)
          territoryBound: true,
          maxHealth: 2000,
          constructionDuration: this.instantBuild() ? 0 : 20, // 2 seconds * 10 ticks/sec
        };
      case UnitType.AtomBomb:
        return {
          cost: (p: Player) =>
            p.type() === PlayerType.Human && this.infiniteGold() ? 0 : 750_000, // Doubled from 375,000
          territoryBound: false,
        };
      case UnitType.HydrogenBomb:
        return {
          cost: (p: Player) =>
            p.type() === PlayerType.Human && this.infiniteGold()
              ? 0
              : 5_000_000, // Doubled from 2,500,000
          territoryBound: false,
        };
      // World-Breakers disabled for this build
      case UnitType.MIRV:
        return {
          cost: () => 999_999_999, // Effectively unbuildable
          territoryBound: false,
        };
      // Original MIRV code:
      //   return {
      //     cost: (p: Player) =>
      //       p.type() === PlayerType.Human && this.infiniteGold()
      //         ? 0
      //         : 12_500_000,
      //     territoryBound: false,
      //   };
      case UnitType.MIRVWarhead:
        return {
          cost: () => 0,
          territoryBound: false,
        };
      case UnitType.TradeShip:
        return {
          cost: () => 0,
          territoryBound: false,
        };
      case UnitType.MissileSilo:
        return {
          cost: (p: Player) =>
            p.type() === PlayerType.Human && this.infiniteGold() ? 0 : 1_000_000, // Doubled from 500,000
          territoryBound: true,
          maxHealth: 2000,
          constructionDuration: this.instantBuild() ? 0 : 100, // 10 seconds * 10 ticks/sec
        };
      case UnitType.DefensePost:
        return {
          cost: (p: Player) =>
            p.type() === PlayerType.Human && this.infiniteGold()
              ? 0
              : 100_000, // Doubled from 50,000, now static
          territoryBound: true,
          maxHealth: 2000,
          constructionDuration: this.instantBuild() ? 0 : 50, // 5 seconds * 10 ticks/sec
        };
      case UnitType.SAMLauncher:
        return {
          cost: (p: Player) =>
            p.type() === PlayerType.Human && this.infiniteGold()
              ? 0
              : 1_000_000, // Doubled from 500,000, now static
          territoryBound: true,
          maxHealth: 2000,
          constructionDuration: this.instantBuild() ? 0 : 150, // 15 seconds * 10 ticks/sec
        };
      case UnitType.OrbitalCannon:
        return {
          cost: (p: Player) =>
            p.type() === PlayerType.Human && this.infiniteGold()
              ? 0
              : 1_000_000, // Doubled from 500,000, now static
          territoryBound: true,
          maxHealth: 2000,
          constructionDuration: this.instantBuild() ? 0 : 150, // 15 seconds * 10 ticks/sec
        };
      case UnitType.City:
        return {
          cost: (p: Player) =>
            p.type() === PlayerType.Human && this.infiniteGold()
              ? 0
              : 250_000, // Quadrupled from original 62,500 (was 125,000)
          territoryBound: true,
          maxHealth: 2000,
          constructionDuration: this.instantBuild() ? 0 : 20, // 2 seconds * 10 ticks/sec
        };
      case UnitType.Construction:
        return {
          cost: () => 0,
          territoryBound: true,
        };
      default:
        assertNever(type);
    }
  }
  defaultDonationAmount(sender: Player): number {
    return Math.floor(sender.troops() / 3);
  }
  donateCooldown(): Tick {
    return 10 * 10;
  }
  emojiMessageDuration(): Tick {
    return 5 * 10;
  }
  emojiMessageCooldown(): Tick {
    return 5 * 10;
  }
  targetDuration(): Tick {
    return 10 * 10;
  }
  targetCooldown(): Tick {
    return 15 * 10;
  }
  allianceRequestCooldown(): Tick {
    return 30 * 10;
  }
  allianceDuration(): Tick {
    return 600 * 10; // 10 minutes.
  }
  temporaryEmbargoDuration(): Tick {
    return 300 * 10; // 5 minutes.
  }

  percentageTilesOwnedToWin(): number {
    if (this._gameConfig.gameMode === GameMode.Team) {
      return 95;
    }
    return 80;
  }
  boatMaxNumber(): number {
    return 6;
  }
  numSpawnPhaseTurns(): number {
    if (this._gameConfig.spawnPhaseTurns !== undefined) {
      return this._gameConfig.spawnPhaseTurns;
    }
    return this._gameConfig.gameType === GameType.Singleplayer ? 50 : 100; // Changed from 300 to 100 ticks (10 seconds)
  }
  numBots(): number {
    return this.bots();
  }
  theme(): Theme {
    return this.userSettings()?.darkMode() ? pastelThemeDark : pastelTheme;
  }

  attackLogic(
    gm: Game,
    attackTroops: number,
    attacker: Player,
    defender: Player | TerraNullius,
    tileToConquer: TileRef,
  ): {
    attackerTroopLoss: number;
    defenderTroopLoss: number;
    tilesPerTickUsed: number;
  } {
    let mag = 0;
    let speed = 0;
    const type = gm.terrainType(tileToConquer);
    switch (type) {
      case TerrainType.Plains:
        mag = 85;
        speed = 16.5;
        break;
      case TerrainType.Highland:
        mag = 100;
        speed = 20;
        break;
      case TerrainType.Mountain:
        mag = 120;
        speed = 25;
        break;
      default:
        throw new Error(`terrain type ${type} not supported`);
    }
    if (defender.isPlayer()) {
      for (const dp of gm.nearbyUnits(
        tileToConquer,
        gm.config().defensePostRange(),
        UnitType.DefensePost,
      )) {
        if (dp.unit.owner() === defender) {
          mag *= this.defensePostDefenseBonus();
          speed *= this.defensePostDefenseBonus();
          break;
        }
      }
    }

    if (gm.hasFallout(tileToConquer)) {
      const falloutRatio = gm.numTilesWithFallout() / gm.numLandTiles();
      mag *= this.falloutDefenseModifier(falloutRatio);
      speed *= this.falloutDefenseModifier(falloutRatio);
    }

    if (attacker.isPlayer() && defender.isPlayer()) {
      if (
        attacker.type() === PlayerType.Human &&
        defender.type() === PlayerType.Bot
      ) {
        mag *= 0.8;
      }
      if (
        attacker.type() === PlayerType.FakeHuman &&
        defender.type() === PlayerType.Bot
      ) {
        mag *= 0.8;
      }
    }

    let largeLossModifier = 1;
    if (attacker.numTilesOwned() > 100_000) {
      largeLossModifier = Math.sqrt(100_000 / attacker.numTilesOwned());
    }
    let largeSpeedMalus = 1;
    if (attacker.numTilesOwned() > 75_000) {
      // sqrt is only exponent 1/2 which doesn't slow enough huge players
      largeSpeedMalus = (75_000 / attacker.numTilesOwned()) ** 0.6;
    }

    if (defender.isPlayer()) {
      return {
        attackerTroopLoss:
          within(defender.troops() / attackTroops, 0.6, 2) *
          mag *
          0.8 *
          largeLossModifier *
          (defender.isTraitor() ? this.traitorDefenseDebuff() : 1),
        defenderTroopLoss: defender.troops() / defender.numTilesOwned(),
        tilesPerTickUsed:
          within(defender.troops() / (5 * attackTroops), 0.2, 1.5) *
          speed *
          largeSpeedMalus,
      };
    } else {
      return {
        attackerTroopLoss:
          attacker.type() === PlayerType.Bot ? mag / 10 : mag / 5,
        defenderTroopLoss: 0,
        tilesPerTickUsed: within(
          (2000 * Math.max(10, speed)) / attackTroops,
          5,
          100,
        ),
      };
    }
  }

  attackTilesPerTick(
    attackTroops: number,
    attacker: Player,
    defender: Player | TerraNullius,
    numAdjacentTilesWithEnemy: number,
  ): number {
    if (defender.isPlayer()) {
      return (
        within(((5 * attackTroops) / defender.troops()) * 2, 0.01, 0.5) *
        numAdjacentTilesWithEnemy *
        3
      );
    } else {
      return numAdjacentTilesWithEnemy * 2;
    }
  }

  boatAttackAmount(attacker: Player, defender: Player | TerraNullius): number {
    return Math.floor(attacker.troops() / 5);
  }

  warshipShellLifetime(): number {
    return 20; // in ticks (one tick is 100ms)
  }

  radiusPortSpawn() {
    return 20;
  }

  proximityBonusPortsNb(totalPorts: number) {
    return within(totalPorts / 3, 4, totalPorts);
  }

  attackAmount(attacker: Player, defender: Player | TerraNullius) {
    if (attacker.type() === PlayerType.Bot) {
      return attacker.troops() / 20;
    } else {
      return attacker.troops() / 5;
    }
  }

  startManpower(playerInfo: PlayerInfo): number {
    if (playerInfo.playerType === PlayerType.Bot) {
      return 10_000;
    }
    if (playerInfo.playerType === PlayerType.FakeHuman) {
      switch (this._gameConfig.difficulty) {
        case Difficulty.Easy:
          return 2_500 * (playerInfo?.nation?.strength ?? 1);
        case Difficulty.Medium:
          return 5_000 * (playerInfo?.nation?.strength ?? 1);
        case Difficulty.Hard:
          return 20_000 * (playerInfo?.nation?.strength ?? 1);
        case Difficulty.Impossible:
          return 50_000 * (playerInfo?.nation?.strength ?? 1);
      }
    }
    return this.infiniteTroops() ? 1_000_000 : 25_000;
  }

  maxPopulation(player: Player | PlayerView): number {
    const maxPop =
      player.type() === PlayerType.Human && this.infiniteTroops()
        ? 1_000_000_000
        : 2 * (Math.pow(player.numTilesOwned(), 0.6) * 1000 + 50000) +
          player.units(UnitType.City).length * this.cityPopulationIncrease();

    if (player.type() === PlayerType.Bot) {
      return maxPop / 2;
    }

    if (player.type() === PlayerType.Human) {
      return maxPop;
    }

    switch (this._gameConfig.difficulty) {
      case Difficulty.Easy:
        return maxPop * 0.5;
      case Difficulty.Medium:
        return maxPop * 1;
      case Difficulty.Hard:
        return maxPop * 1.5;
      case Difficulty.Impossible:
        return maxPop * 2;
    }
  }

  populationIncreaseRate(player: Player): number {
    const max = this.maxPopulation(player);

    let toAdd = 10 + Math.pow(player.population(), 0.73) / 4;

    const ratio = 1 - player.population() / max;
    toAdd *= ratio;

    if (player.type() === PlayerType.Bot) {
      toAdd *= 0.7;
    }

    if (player.type() === PlayerType.FakeHuman) {
      switch (this._gameConfig.difficulty) {
        case Difficulty.Easy:
          toAdd *= 0.9;
          break;
        case Difficulty.Medium:
          toAdd *= 1;
          break;
        case Difficulty.Hard:
          toAdd *= 1.1;
          break;
        case Difficulty.Impossible:
          toAdd *= 1.2;
          break;
      }
    }

    // Increase troop gain speed by 30%
    toAdd *= 1.3;

    return Math.min(player.population() + toAdd, max) - player.population();
  }

  goldAdditionRate(player: Player): number {
    // Increase gold gain speed by 30%
    return (Math.sqrt(player.workers() * player.numTilesOwned()) / 200) * 1.3;
  }

  troopAdjustmentRate(player: Player): number {
    const maxDiff = this.maxPopulation(player) / 1000;
    const target = player.population() * player.targetTroopRatio();
    const diff = target - player.troops();
    if (Math.abs(diff) < maxDiff) {
      return diff;
    }
    const adjustment = maxDiff * Math.sign(diff);
    // Can ramp down troops much faster
    if (adjustment < 0) {
      return adjustment * 5;
    }
    return adjustment;
  }

  nukeMagnitudes(unitType: UnitType): NukeMagnitude {
    switch (unitType) {
      case UnitType.MIRVWarhead:
        return { inner: 25, outer: 30 };
      case UnitType.AtomBomb:
        return { inner: 12, outer: 30 };
      case UnitType.HydrogenBomb:
        return { inner: 80, outer: 100 };
    }
    throw new Error(`Unknown nuke type: ${unitType}`);
  }

  defaultNukeSpeed(): number {
    return 16; // Doubled from 8 for faster nuke travel
  }

  // Humans can be population, soldiers attacking, soldiers in boat etc.
  nukeDeathFactor(humans: number, tilesOwned: number): number {
    return (5 * humans) / Math.max(1, tilesOwned);
  }

  structureMinDist(): number {
    // TODO: Increase this to ~15 once upgradable structures are implemented.
    return 1;
  }

  shellLifetime(): number {
    return 50;
  }

  warshipPatrolRange(): number {
    return 100;
  }

  warshipTargettingRange(): number {
    return 130;
  }

  warshipShellAttackRate(): number {
    return 20;
  }

  defensePostShellAttackRate(): number {
    return 100;
  }

  safeFromPiratesCooldownMax(): number {
    return 20;
  }

  defensePostTargettingRange(): number {
    return 75;
  }
}
