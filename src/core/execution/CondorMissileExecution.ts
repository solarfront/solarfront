import {
  Execution,
  Game,
  MessageType,
  Player,
  Unit,
  UnitType,
} from "../game/Game";
import { TileRef } from "../game/GameMap";
import { AirPathFinder } from "../pathfinding/PathFinding";
import { PseudoRandom } from "../PseudoRandom";

export class CondorMissileExecution implements Execution {
  private active = true;
  private mg: Game;
  private missile: Unit | undefined;
  private pathFinder: AirPathFinder;
  private destroyAtTick: number = -1;

  constructor(
    private spawn: TileRef,
    private _owner: Player,
    private condor: Unit,
    private target: Unit,
  ) {}

  init(mg: Game, ticks: number): void {
    this.mg = mg;
    this.pathFinder = new AirPathFinder(mg, new PseudoRandom(mg.ticks()));
  }

  tick(ticks: number): void {
    if (this.missile === undefined) {
      this.missile = this._owner.buildUnit(UnitType.SAMMissile, this.spawn, {});
    }
    if (!this.missile.isActive()) {
      this.active = false;
      return;
    }
    if (
      !this.target.isActive() ||
      this.target.owner() === this.missile.owner() ||
      (this.destroyAtTick !== -1 && this.mg.ticks() >= this.destroyAtTick)
    ) {
      // Target destroyed or neutralized, or timeout
      this.missile.delete(false);
      this.active = false;
      return;
    }

    if (this.destroyAtTick === -1 && !this.condor.isActive()) {
      this.destroyAtTick = this.mg.ticks() + this.mg.config().shellLifetime();
    }

    // Get base speed - 1.5x nuke speed when targeting nukes, double normal speed otherwise
    const moveSpeed =
      this.target.type() === UnitType.AtomBomb ||
      this.target.type() === UnitType.HydrogenBomb
        ? Math.ceil(this.mg.config().defaultNukeSpeed() * 1.5)
        : 6; // Doubled from 3 to 6 tiles per tick

    // Move multiple times per tick
    for (let i = 0; i < moveSpeed; i++) {
      const result = this.pathFinder.nextTile(
        this.missile.tile(),
        this.target.tile(),
      );
      if (result === true) {
        // Hit the target
        if (
          this.target.type() === UnitType.AtomBomb ||
          this.target.type() === UnitType.HydrogenBomb
        ) {
          // For nukes, destroy both missile and nuke
          this.mg.displayMessage(
            `Condor missile intercepted ${this.target.type()}!`,
            MessageType.SUCCESS,
            this._owner.id(),
          );
          this.target.delete();
          this.missile.delete(false);
        } else {
          // For regular targets, apply damage
          const damage = this.getCondorMissileDamage();
          this.target.modifyHealth(-damage);
          this.missile.delete(false);
          // Message removed to reduce event log spam
        }
        this.active = false;
        return;
      } else {
        this.missile.move(result);
      }
    }
  }

  private getCondorMissileDamage(): number {
    // Same damage as Condor shells: base damage (250) * 2 = 500
    const { damage } = this.mg.config().unitInfo(UnitType.Shell);
    const baseDamage = damage ?? 250;
    return baseDamage * 2;
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }
}
