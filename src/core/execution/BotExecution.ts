import { Execution, Game, Player, PlayerType, UnitType } from "../game/Game";
import { PseudoRandom } from "../PseudoRandom";
import { simpleHash } from "../Util";
import { ConstructionExecution } from "./ConstructionExecution";
import { BotBehavior } from "./utils/BotBehavior";

export class BotExecution implements Execution {
  private active = true;
  private random: PseudoRandom;
  private mg: Game;
  private neighborsTerraNullius = true;

  private behavior: BotBehavior | null = null;
  private attackRate: number;
  private attackTick: number;
  private triggerRatio: number;
  private reserveRatio: number;

  constructor(private bot: Player) {
    this.random = new PseudoRandom(simpleHash(bot.id()));
    this.attackRate = this.random.nextInt(40, 80);
    this.attackTick = this.random.nextInt(0, this.attackRate);
    this.triggerRatio = this.random.nextInt(60, 90) / 100;
    this.reserveRatio = this.random.nextInt(30, 60) / 100;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }

  init(mg: Game) {
    this.mg = mg;
    this.bot.setTargetTroopRatio(0.7);
  }

  tick(ticks: number) {
    if (ticks % this.attackRate !== this.attackTick) return;

    if (!this.bot.isAlive()) {
      this.active = false;
      return;
    }

    if (this.behavior === null) {
      this.behavior = new BotBehavior(
        this.random,
        this.mg,
        this.bot,
        this.triggerRatio,
        this.reserveRatio,
      );
    }

    this.behavior.handleAllianceRequests();
    this.handleUnits();
    this.maybeAttack();
  }

  private handleUnits() {
    if (!this.bot.isAlive()) return;

    // Bots are no longer allowed to build ports or buildings
    const ports = this.bot.units(UnitType.Port);

    // Build condors if we have ports (max 2)
    const condors = this.bot.units(UnitType.Condor);
    if (
      ports.length > 0 &&
      condors.length < 2 &&
      this.bot.gold() >= this.mg.unitInfo(UnitType.Condor).cost(this.bot)
    ) {
      if (this.random.chance(40)) {
        // 40% chance to build condor
        const port = this.random.randElement(ports);
        const spawnTile = this.warshipSpawnTile(port.tile());
        if (spawnTile !== null) {
          const canBuild = this.bot.canBuild(UnitType.Condor, spawnTile);
          if (canBuild !== false) {
            this.mg.addExecution(
              new ConstructionExecution(
                this.bot.id(),
                spawnTile,
                UnitType.Condor,
              ),
            );
            return;
          }
        }
      }
    }
  }

  private randTerritoryTile() {
    const tiles = Array.from(this.bot.tiles());
    if (tiles.length === 0) return null;
    return this.random.randElement(tiles);
  }

  private warshipSpawnTile(portTile: any) {
    const nearbyOcean = this.mg
      .neighbors(portTile)
      .filter(
        (t) =>
          this.mg.isOcean(t) && this.bot.canBuild(UnitType.Condor, t) !== false,
      );
    if (nearbyOcean.length === 0) return null;
    return this.random.randElement(nearbyOcean);
  }

  private maybeAttack() {
    if (this.behavior === null) {
      throw new Error("not initialized");
    }
    const traitors = this.bot
      .neighbors()
      .filter((n) => n.isPlayer() && n.isTraitor()) as Player[];
    if (traitors.length > 0) {
      const toAttack = this.random.randElement(traitors);
      const odds = this.bot.isFriendly(toAttack) ? 6 : 3;
      if (this.random.chance(odds)) {
        const isBotTarget = toAttack.type() === PlayerType.Bot;
        this.behavior.sendAttack(toAttack, isBotTarget);
        return;
      }
    }

    if (this.neighborsTerraNullius) {
      if (this.bot.sharesBorderWith(this.mg.terraNullius())) {
        this.behavior.sendAttack(this.mg.terraNullius(), false);
        return;
      }
      this.neighborsTerraNullius = false;
    }

    this.behavior.forgetOldEnemies();
    this.behavior.checkIncomingAttacks();
    const enemy = this.behavior.selectRandomEnemy();
    if (!enemy) return;
    if (!this.bot.sharesBorderWith(enemy)) return;
    const isBotTarget = enemy.isPlayer() && enemy.type() === PlayerType.Bot;
    this.behavior.sendAttack(enemy, isBotTarget);
  }

  isActive(): boolean {
    return this.active;
  }
}
