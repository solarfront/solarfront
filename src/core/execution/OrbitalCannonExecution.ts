import { consolex } from "../Consolex";
import {
  Execution,
  Game,
  MessageType,
  Player,
  PlayerID,
  Unit,
  UnitType,
} from "../game/Game";
import { TileRef } from "../game/GameMap";
import { PseudoRandom } from "../PseudoRandom";
import { OrbitalCannonMissileExecution } from "./OrbitalCannonMissileExecution";

export class OrbitalCannonExecution implements Execution {
  private player: Player;
  private mg: Game;
  private active: boolean = true;

  private searchRangeRadius = 150;

  private pseudoRandom: PseudoRandom | undefined;

  private lastAttack = 0; // Track last attack time for attack rate

  constructor(
    private ownerId: PlayerID,
    private tile: TileRef | null,
    private orbitalCannon: Unit | null = null,
  ) {
    if (orbitalCannon !== null) {
      this.tile = orbitalCannon.tile();
    }
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }

  init(mg: Game, ticks: number): void {
    this.mg = mg;
    this.player = mg.player(this.ownerId)!;
  }

  attachToGame(mg: Game): void {
    this.mg = mg;
    this.player = mg.player(this.ownerId)!;
  }

  isActive(): boolean {
    return this.active;
  }

  tick(ticks: number): void {
    if (this.mg === null || this.player === null) {
      throw new Error("Not initialized");
    }
    if (this.orbitalCannon === null) {
      if (this.tile === null) {
        throw new Error("tile is null");
      }
      const spawnTile = this.player.canBuild(UnitType.OrbitalCannon, this.tile);
      if (spawnTile === false) {
        consolex.warn("cannot build Orbital Cannon");
        this.active = false;
        return;
      }
      this.orbitalCannon = this.player.buildUnit(
        UnitType.OrbitalCannon,
        spawnTile,
        {},
      );
    }
    if (!this.orbitalCannon.isActive()) {
      this.active = false;
      return;
    }

    if (this.player !== this.orbitalCannon.owner()) {
      this.player = this.orbitalCannon.owner();
    }

    if (this.pseudoRandom === undefined) {
      this.pseudoRandom = new PseudoRandom(this.orbitalCannon.id());
    }

    // HP regeneration: 1 HP per tick
    const maxHealth = this.orbitalCannon.info().maxHealth;
    if (maxHealth && this.orbitalCannon.health() < maxHealth) {
      this.orbitalCannon.modifyHealth(1);
    }

    // Get target - transport vessels, vipers, or condors
    const target = this.getTarget();

    // Check if we can fire based on attack rate (same as Condor)
    const attackRate = this.mg.config().warshipShellAttackRate();
    if (target && this.mg.ticks() - this.lastAttack > attackRate) {
      // Check if target is still in range and active
      if (
        target.isActive() &&
        this.mg.manhattanDist(target.tile(), this.orbitalCannon.tile()) <=
          this.searchRangeRadius
      ) {
        this.lastAttack = this.mg.ticks();

        // Launch missile at target
        this.mg.displayMessage(
          `Orbital Cannon targeting ${target.type()}`,
          MessageType.INFO,
          this.player.id(),
        );

        this.mg.addExecution(
          new OrbitalCannonMissileExecution(
            this.orbitalCannon.tile(),
            this.player,
            this.orbitalCannon,
            target,
            12, // missile speed
          ),
        );
      }
    }
  }

  private getTarget(): Unit | null {
    // First priority: Find units that are actively targeting this Orbital Cannon
    const attackingUnits = [
      ...this.mg.nearbyUnits(
        this.orbitalCannon!.tile(),
        this.searchRangeRadius,
        UnitType.Viper,
      ),
      ...this.mg.nearbyUnits(
        this.orbitalCannon!.tile(),
        this.searchRangeRadius,
        UnitType.Condor,
      ),
    ]
      .map(({ unit }) => unit)
      .filter(
        (unit) =>
          unit.owner() !== this.player &&
          !this.player.isFriendly(unit.owner()) &&
          unit.targetUnit() === this.orbitalCannon, // Prioritize units attacking us
      );

    if (attackingUnits.length > 0) {
      // Sort attacking units by distance
      attackingUnits.sort((a, b) => {
        const distA = this.mg.manhattanDist(
          a.tile(),
          this.orbitalCannon!.tile(),
        );
        const distB = this.mg.manhattanDist(
          b.tile(),
          this.orbitalCannon!.tile(),
        );
        return distA - distB;
      });
      return attackingUnits[0];
    }

    // Second priority: Find all enemy transport vessels, vipers, and condors in range
    const enemyUnits = [
      ...this.mg.nearbyUnits(
        this.orbitalCannon!.tile(),
        this.searchRangeRadius,
        UnitType.TransportShip,
      ),
      ...this.mg.nearbyUnits(
        this.orbitalCannon!.tile(),
        this.searchRangeRadius,
        UnitType.Viper,
      ),
      ...this.mg.nearbyUnits(
        this.orbitalCannon!.tile(),
        this.searchRangeRadius,
        UnitType.Condor,
      ),
    ]
      .map(({ unit }) => unit)
      .filter(
        (unit) =>
          unit.owner() !== this.player && !this.player.isFriendly(unit.owner()),
      );

    if (enemyUnits.length === 0) {
      return null;
    }

    // Sort by distance and return the closest
    enemyUnits.sort((a, b) => {
      const distA = this.mg.manhattanDist(a.tile(), this.orbitalCannon!.tile());
      const distB = this.mg.manhattanDist(b.tile(), this.orbitalCannon!.tile());
      return distA - distB;
    });

    return enemyUnits[0];
  }

  shutdown(): void {
    if (this.orbitalCannon) {
      this.orbitalCannon.delete();
    }
  }
}
