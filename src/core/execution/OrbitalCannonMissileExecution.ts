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

export class OrbitalCannonMissileExecution implements Execution {
  private active = true;
  private pathFinder: AirPathFinder;
  private missile: Unit | undefined;
  private mg: Game;

  constructor(
    private spawn: TileRef,
    private _owner: Player,
    private ownerUnit: Unit,
    private target: Unit,
    private speed: number = 12,
  ) {}

  init(mg: Game, ticks: number): void {
    this.pathFinder = new AirPathFinder(mg, new PseudoRandom(mg.ticks()));
    this.mg = mg;
  }

  tick(ticks: number): void {
    if (this.missile === undefined) {
      this.missile = this._owner.buildUnit(UnitType.SAMMissile, this.spawn, {});
    }
    if (!this.missile.isActive()) {
      this.active = false;
      return;
    }

    // Check if target is still valid
    const validTargets = [
      UnitType.TransportShip,
      UnitType.Viper,
      UnitType.Condor,
    ];
    if (
      !this.target.isActive() ||
      !this.ownerUnit.isActive() ||
      this.target.owner() === this.missile.owner() ||
      !validTargets.includes(this.target.type())
    ) {
      this.missile.delete(false);
      this.active = false;
      return;
    }

    // Move missile towards target
    for (let i = 0; i < this.speed; i++) {
      const result = this.pathFinder.nextTile(
        this.missile.tile(),
        this.target.tile(),
      );
      if (result === true) {
        // Hit target
        const damage =
          this.target.type() === UnitType.TransportShip ? 9999 : 300;
        this.target.modifyHealth(-damage);

        this.mg.displayMessage(
          `Orbital Cannon hit ${this.target.type()}`,
          MessageType.SUCCESS,
          this._owner.id(),
        );

        this.active = false;
        this.missile.delete(false);
        return;
      } else {
        this.missile.move(result);
      }
    }
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }
}
