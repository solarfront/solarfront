import { renderNumber } from "../../client/Utils";
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
import { PathFindResultType } from "../pathfinding/AStar";
import { PathFinder } from "../pathfinding/PathFinding";
import { distSortUnit } from "../Util";

export class TradeShipExecution implements Execution {
  private active = true;
  private mg: Game | null = null;
  private origOwner: Player | null = null;
  private tradeShip: Unit | null = null;
  private lastMoveTick = 0;
  private readonly ticksPerMove = 2;
  private stuckTicks = 0;
  private readonly stuckThreshold = 20;
  private pendingTicks = 0;
  private readonly pendingThreshold = 30;
  private lastTile: TileRef | null = null;
  private visitedCount: Map<TileRef, number> = new Map();
  private index = 0;
  private wasCaptured = false;
  private tilesTraveled = 0;

  constructor(
    private _owner: PlayerID,
    private srcPort: Unit,
    private _dstPort: Unit,
    private pathFinder: PathFinder,
  ) {}

  init(mg: Game, ticks: number): void {
    this.mg = mg;
    this.origOwner = mg.player(this._owner);
  }

  tick(ticks: number): void {
    if (this.mg === null || this.origOwner === null) {
      throw new Error("Not initialized");
    }
    if (ticks - this.lastMoveTick < this.ticksPerMove) {
      return;
    }
    if (this.tradeShip === null) {
      const spawn = this.origOwner.canBuild(
        UnitType.TradeShip,
        this.srcPort.tile(),
      );
      if (spawn === false) {
        consolex.warn(`cannot build trade ship`);
        this.active = false;
        return;
      }
      this.tradeShip = this.origOwner.buildUnit(UnitType.TradeShip, spawn, {
        dstPort: this._dstPort,
        lastSetSafeFromPirates: ticks,
      });
      this.lastMoveTick = ticks;
      this.lastTile = this.tradeShip.tile();
    }

    if (this.tradeShip) {
      const currentTile = this.tradeShip.tile();
      if (this.lastTile !== null && currentTile === this.lastTile) {
        this.stuckTicks++;
      } else {
        this.stuckTicks = 0;
      }
      this.lastTile = currentTile;

      const visits = (this.visitedCount.get(currentTile) ?? 0) + 1;
      this.visitedCount.set(currentTile, visits);
      if (visits > 10) {
        consolex.warn(
          "Trade ship appears stuck in a movement loop, deleting ship",
        );
        this.tradeShip.delete(false);
        this.active = false;
        return;
      }

      if (this.stuckTicks >= this.stuckThreshold) {
        consolex.warn("Trade ship stuck – recomputing path");
        this.pathFinder = PathFinder.Mini(this.mg, 10000, 20);
        this.stuckTicks = 0;
      }
    }

    if (!this.tradeShip.isActive()) {
      this.active = false;
      return;
    }

    if (this.origOwner !== this.tradeShip.owner()) {
      // Store as variable in case ship is recaptured by previous owner
      this.wasCaptured = true;
    }

    // If a player captures another player's port while trading we should delete
    // the ship.
    if (this._dstPort.owner().id() === this.srcPort.owner().id()) {
      this.tradeShip.delete(false);
      this.active = false;
      return;
    }

    if (
      !this.wasCaptured &&
      (!this._dstPort.isActive() ||
        !this.tradeShip.owner().canTrade(this._dstPort.owner()))
    ) {
      this.tradeShip.delete(false);
      this.active = false;
      return;
    }

    if (this.wasCaptured) {
      const ports = this.tradeShip
        .owner()
        .units(UnitType.Port)
        .sort(distSortUnit(this.mg, this.tradeShip));
      if (ports.length === 0) {
        this.tradeShip.delete(false);
        this.active = false;
        return;
      } else {
        this._dstPort = ports[0];
        this.tradeShip.setTargetUnit(this._dstPort);
      }
    }

    const cachedNextTile = this._dstPort.cacheGet(this.tradeShip.tile());
    if (
      cachedNextTile !== undefined &&
      cachedNextTile !== this.tradeShip.tile()
    ) {
      if (
        this.mg.isWater(cachedNextTile) &&
        this.mg.isShoreline(cachedNextTile)
      ) {
        this.tradeShip.setSafeFromPirates();
      }

      // Store current tile to check if movement actually happened
      const currentTile = this.tradeShip.tile();

      this.tradeShip.move(cachedNextTile);
      this.lastMoveTick = ticks;

      // If the boat hasn't actually moved after using the cached path,
      // the path is incomplete or invalid - force recomputation
      if (this.tradeShip.tile() === currentTile) {
        consolex.warn(
          "Trade ship couldn't move using cached path - recomputing",
        );
        this.pathFinder = PathFinder.Mini(this.mg, 10000, 20);
        return; // Skip incrementing counters since we didn't move
      }

      this.stuckTicks = 0;
      this.pendingTicks = 0;
      this.tilesTraveled++;
      return;
    }

    const result = this.pathFinder.nextTile(
      this.tradeShip.tile(),
      this._dstPort.tile(),
    );

    switch (result.type) {
      case PathFindResultType.Completed:
        this.complete();
        break;
      case PathFindResultType.Pending:
        this.pendingTicks++;
        if (this.pendingTicks > this.pendingThreshold) {
          consolex.warn(
            "Trade ship path computation taking too long – resetting pathfinder and clearing cache",
          );
          this.pathFinder = PathFinder.Mini(this.mg, 10000, 20);
          this.pendingTicks = 0;
        }
        this.tradeShip.touch();
        break;
      case PathFindResultType.NextTile:
        if (result.tile === this.tradeShip.tile()) {
          consolex.warn(
            "Trade ship path returned current tile – forcing recompute",
          );
          this.pathFinder = PathFinder.Mini(this.mg, 10000, 20);
          break;
        }

        this._dstPort.cachePut(this.tradeShip.tile(), result.tile);
        if (this.mg.isWater(result.tile) && this.mg.isShoreline(result.tile)) {
          this.tradeShip.setSafeFromPirates();
        }
        this.tradeShip.move(result.tile);
        this.lastMoveTick = ticks;
        this.stuckTicks = 0;
        this.pendingTicks = 0;
        this.tilesTraveled++;
        break;
      case PathFindResultType.PathNotFound:
        consolex.warn("captured trade ship cannot find route");
        if (this.tradeShip.isActive()) {
          this.tradeShip.delete(false);
        }
        this.active = false;
        break;
    }
  }

  private complete() {
    if (this.mg === null || this.origOwner === null) {
      throw new Error("Not initialized");
    }
    if (this.tradeShip === null) return;
    this.active = false;
    this.tradeShip.delete(false);
    const gold = this.mg.config().tradeShipGold(this.tilesTraveled);

    if (this.wasCaptured) {
      this.tradeShip.owner().addGold(gold);
      this.mg.displayMessage(
        `Received ${renderNumber(gold)} gold from ship captured from ${this.origOwner.displayName()}`,
        MessageType.SUCCESS,
        this.tradeShip.owner().id(),
      );
    } else {
      this.srcPort.owner().addGold(gold);
      this._dstPort.owner().addGold(gold);
      this.mg.displayMessage(
        `Received ${renderNumber(gold)} gold from trade with ${this.srcPort.owner().displayName()}`,
        MessageType.SUCCESS,
        this._dstPort.owner().id(),
      );
      this.mg.displayMessage(
        `Received ${renderNumber(gold)} gold from trade with ${this._dstPort.owner().displayName()}`,
        MessageType.SUCCESS,
        this.srcPort.owner().id(),
      );
    }
    return;
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }

  dstPort(): TileRef {
    return this._dstPort.tile();
  }
}
