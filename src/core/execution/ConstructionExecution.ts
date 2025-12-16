import { consolex } from "../Consolex";
import {
  Execution,
  Game,
  Player,
  PlayerID,
  Tick,
  Unit,
  UnitType,
} from "../game/Game";
import { TileRef } from "../game/GameMap";
import { CityExecution } from "./CityExecution";
import { DefensePostExecution } from "./DefensePostExecution";
// import { MirvExecution } from "./MIRVExecution"; // World-Breakers disabled
import { MissileSiloExecution } from "./MissileSiloExecution";
import { NukeExecution } from "./NukeExecution";
import { OrbitalCannonExecution } from "./OrbitalCannonExecution";
import { PortExecution } from "./PortExecution";
import { SAMLauncherExecution } from "./SAMLauncherExecution";
import { WarshipExecution } from "./WarshipExecution";

export class ConstructionExecution implements Execution {
  private player: Player;
  private construction: Unit | null = null;
  private active: boolean = true;
  private mg: Game;

  private ticksUntilComplete: Tick;
  private originalConstructionDuration: Tick;

  private cost: number;
  private associatedPort: Unit | null = null;

  constructor(
    private ownerId: PlayerID,
    private tile: TileRef,
    private constructionType: UnitType,
  ) {}

  init(mg: Game, ticks: number): void {
    this.mg = mg;
    if (!mg.hasPlayer(this.ownerId)) {
      console.warn(`ConstructionExecution: owner ${this.ownerId} not found`);
      this.active = false;
      return;
    }
    this.player = mg.player(this.ownerId);
  }

  tick(ticks: number): void {
    if (this.construction === null) {
      const info = this.mg.unitInfo(this.constructionType);
      if (info.constructionDuration === undefined) {
        this.completeConstruction();
        this.active = false;
        return;
      }
      const spawnTile = this.player.canBuild(this.constructionType, this.tile);
      if (spawnTile === false) {
        consolex.warn(`cannot build ${this.constructionType}`);
        this.active = false;
        return;
      }
      this.construction = this.player.buildUnit(
        UnitType.Construction,
        spawnTile,
        {},
      );
      this.cost = this.mg.unitInfo(this.constructionType).cost(this.player);
      this.player.removeGold(this.cost);
      this.construction.setConstructionType(this.constructionType);
      this.ticksUntilComplete = info.constructionDuration;
      this.originalConstructionDuration = info.constructionDuration;

      // For Viper/Condor, find and set up the associated port queue using closest port to cursor
      if (this.constructionType === UnitType.Viper || this.constructionType === UnitType.Condor) {
        this.associatedPort = this.player.getClosestAvailablePortForWarship(this.tile);
        if (this.associatedPort) {
          // Double-check the port is still available (prevent race conditions)
          if (this.associatedPort.hasPortQueue()) {
            consolex.warn(`Port at ${this.associatedPort.tile()} already has a queue, cancelling construction`);
            this.construction.delete(false);
            this.active = false;
            return;
          }
          this.associatedPort.setPortQueue(this.constructionType, 0);
        } else {
          // No available ports, cancel construction
          consolex.warn(`No available ports for ${this.constructionType}, cancelling construction`);
          this.construction.delete(false);
          this.active = false;
          return;
        }
      }

      return;
    }

    if (!this.construction.isActive()) {
      // Clear associated port queue if construction was interrupted
      if (this.associatedPort && this.associatedPort.isActive()) {
        this.associatedPort.clearPortQueue();
      }
      this.active = false;
      return;
    }

    if (this.player !== this.construction.owner()) {
      this.player = this.construction.owner();
    }

    this.ticksUntilComplete--;
    
    if (this.ticksUntilComplete <= 0) {
      this.player = this.construction.owner();
      this.construction.delete(false);
      // refund the cost so player has the gold to build the unit
      this.player.addGold(this.cost);
      this.completeConstruction();
      this.active = false;
      return;
    }
    
    // Update construction progress (after decrementing)
    const progress = 1 - (this.ticksUntilComplete / this.originalConstructionDuration);
    this.construction.setConstructionProgress(progress);
    this.construction.touch(); // Update the client

    // Update associated port queue progress for Viper/Condor
    if (this.associatedPort && this.associatedPort.isActive()) {
      this.associatedPort.setPortQueue(this.constructionType, progress);
    }
  }

  private completeConstruction() {
    const player = this.player;
    switch (this.constructionType) {
      case UnitType.AtomBomb:
      case UnitType.HydrogenBomb:
        this.mg.addExecution(
          new NukeExecution(this.constructionType, player.id(), this.tile),
        );
        break;
      // World-Breakers disabled for this build
      case UnitType.MIRV:
        // MIRVs are disabled - do nothing if somehow requested
        break;
      // Original MIRV code:
      //   this.mg.addExecution(new MirvExecution(player.id(), this.tile));
      //   break;
      case UnitType.Viper:
      case UnitType.Condor:
        // Clear the associated port queue
        if (this.associatedPort && this.associatedPort.isActive()) {
          this.associatedPort.clearPortQueue();
          // Spawn warship from the port that has it queued, not from cursor position
          this.mg.addExecution(
            new WarshipExecution(player.id(), this.associatedPort.tile(), this.constructionType),
          );
        } else {
          // Fallback to original tile if no associated port (shouldn't happen)
          this.mg.addExecution(
            new WarshipExecution(player.id(), this.tile, this.constructionType),
          );
        }
        break;
      case UnitType.Port:
        this.mg.addExecution(new PortExecution(player.id(), this.tile));
        break;
      case UnitType.MissileSilo:
        this.mg.addExecution(new MissileSiloExecution(player.id(), this.tile));
        break;
      case UnitType.DefensePost:
        this.mg.addExecution(new DefensePostExecution(player.id(), this.tile));
        break;
      case UnitType.SAMLauncher:
        this.mg.addExecution(new SAMLauncherExecution(player.id(), this.tile));
        break;
      case UnitType.City:
        this.mg.addExecution(new CityExecution(player.id(), this.tile));
        break;
      case UnitType.OrbitalCannon:
        this.mg.addExecution(
          new OrbitalCannonExecution(player.id(), this.tile),
        );
        break;
      default:
        throw Error(`unit type ${this.constructionType} not supported`);
    }
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }
}
