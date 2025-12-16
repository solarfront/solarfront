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
import { PseudoRandom } from "../PseudoRandom";
import { CondorMissileExecution } from "./CondorMissileExecution";
import { ShellExecution } from "./ShellExecution";

export class WarshipExecution implements Execution {
  private random: PseudoRandom;

  private _owner: Player;
  private active = true;
  private warship: Unit | null = null;
  private mg: Game;

  private target: Unit | undefined = undefined;
  private pathfinder: PathFinder | null = null;

  private patrolTile: TileRef | undefined;

  private lastShellAttack = 0;
  private alreadySentShell = new Set<Unit>();

  // Add nuke-related properties for Condors
  private nukeSearchRadius = 200; // Same as orbital cannons
  private lastNukeIntercept = 0;
  private readonly NUKE_INTERCEPT_COOLDOWN = 200; // 20 seconds (1 tick = 100ms)

  constructor(
    private playerID: PlayerID,
    private patrolCenterTile: TileRef,
    private unitType: UnitType = UnitType.Viper, // Default to Viper for backward compatibility
  ) {}

  init(mg: Game, ticks: number): void {
    this.mg = mg;
    if (!mg.hasPlayer(this.playerID)) {
      console.log(`WarshipExecution: player ${this.playerID} not found`);
      this.active = false;
      return;
    }
    this.pathfinder = PathFinder.Mini(mg, 5000);
    this._owner = mg.player(this.playerID);
    this.patrolTile = this.patrolCenterTile;
    this.random = new PseudoRandom(mg.ticks());
  }

  // Only for warships with "moveTarget" set
  goToMoveTarget(target: TileRef) {
    if (this.warship === null || this.pathfinder === null) {
      throw new Error("Warship not initialized");
    }

    // Vipers move twice as fast
    const moveIterations = this.warship.type() === UnitType.Viper ? 2 : 1;

    for (let moveCount = 0; moveCount < moveIterations; moveCount++) {
      // Patrol unless we are hunting down a tradeship
      const result = this.pathfinder.nextTile(this.warship.tile(), target);
      switch (result.type) {
        case PathFindResultType.Completed:
          this.warship.setTargetTile(undefined);
          this.warship.touch();
          return;
        case PathFindResultType.NextTile:
          this.warship.move(result.tile);
          break;
        case PathFindResultType.Pending:
          this.warship.touch();
          return; // Exit early on pending
        case PathFindResultType.PathNotFound:
          consolex.log(`path not found to target`);
          return; // Exit early on path not found
      }
    }
  }

  private shoot() {
    if (
      this.mg === null ||
      this.warship === null ||
      this.target === undefined
    ) {
      throw new Error("Warship not initialized");
    }
    const shellAttackRate = this.mg.config().warshipShellAttackRate();
    if (this.mg.ticks() - this.lastShellAttack > shellAttackRate) {
      this.lastShellAttack = this.mg.ticks();

      if (this.warship.type() === UnitType.Condor) {
        // Condors shoot missiles instead of shells
        this.mg.addExecution(
          new CondorMissileExecution(
            this.warship.tile(),
            this.warship.owner(),
            this.warship,
            this.target,
          ),
        );
      } else {
        // Vipers shoot shells
        this.mg.addExecution(
          new ShellExecution(
            this.warship.tile(),
            this.warship.owner(),
            this.warship,
            this.target,
          ),
        );
      }

      if (!this.target.hasHealth()) {
        // Don't send multiple shells to target that can be oneshotted
        this.alreadySentShell.add(this.target);
        this.target = undefined;
        return;
      }
    }
  }

  private getNukeTarget(): Unit | null {
    if (this.warship === null || this.warship.type() !== UnitType.Condor) {
      return null; // Only Condors can shoot down nukes
    }

    // Find all enemy nukes in range that aren't already being targeted by a SAM
    const nukes = [
      ...this.mg.nearbyUnits(
        this.warship.tile(),
        this.nukeSearchRadius,
        UnitType.AtomBomb,
      ),
      ...this.mg.nearbyUnits(
        this.warship.tile(),
        this.nukeSearchRadius,
        UnitType.HydrogenBomb,
      ),
    ]
      .map(({ unit }) => unit)
      .filter(
        (unit) =>
          unit.owner() !== this._owner &&
          !this._owner.isFriendly(unit.owner()) &&
          !unit.targetedBySAM(), // Don't target nukes that SAMs are already handling
      );

    if (nukes.length === 0) {
      return null;
    }

    // Sort by priority: Hydrogen Bombs first, then by distance
    nukes.sort((a, b) => {
      // Prioritize Hydrogen Bombs
      if (
        a.type() === UnitType.HydrogenBomb &&
        b.type() !== UnitType.HydrogenBomb
      ) {
        return -1;
      }
      if (
        a.type() !== UnitType.HydrogenBomb &&
        b.type() === UnitType.HydrogenBomb
      ) {
        return 1;
      }

      // If both are the same type, sort by distance
      const distA = this.mg.manhattanDist(a.tile(), this.warship!.tile());
      const distB = this.mg.manhattanDist(b.tile(), this.warship!.tile());
      return distA - distB;
    });

    return nukes[0];
  }

  private patrol() {
    if (this.warship === null || this.pathfinder === null) {
      throw new Error("Warship not initialized");
    }
    if (this.patrolTile === undefined) {
      this.patrolTile = this.randomTile();
      if (this.patrolTile === undefined) {
        return;
      }
    }
    this.warship.setTargetUnit(this.target);
    if (
      this.target === undefined ||
      this.target.type() !== UnitType.TradeShip
    ) {
      // Vipers move twice as fast
      const moveIterations = this.warship.type() === UnitType.Viper ? 2 : 1;

      for (let moveCount = 0; moveCount < moveIterations; moveCount++) {
        // Patrol unless we are hunting down a tradeship
        const result = this.pathfinder.nextTile(
          this.warship.tile(),
          this.patrolTile,
        );
        switch (result.type) {
          case PathFindResultType.Completed:
            this.patrolTile = undefined;
            this.warship.touch();
            return; // Exit after reaching patrol point
          case PathFindResultType.NextTile:
            this.warship.move(result.tile);
            break;
          case PathFindResultType.Pending:
            this.warship.touch();
            return; // Exit early on pending
          case PathFindResultType.PathNotFound:
            consolex.log(`path not found to patrol tile`);
            this.patrolTile = undefined;
            return; // Exit early on path not found
        }
      }
    }
  }

  tick(ticks: number): void {
    if (this.pathfinder === null) throw new Error("Warship not initialized");

    if (this.warship === null) {
      if (this.patrolTile === undefined) {
        console.log(
          `WarshipExecution: no patrol tile for ${this._owner.name()}`,
        );
        this.active = false;
        return;
      }
      // Find a valid spawn location near the port, not at the patrol tile
      const spawnTile = this.findSpawnLocationNearPort(this.patrolCenterTile);
      if (spawnTile === null) {
        consolex.warn(`WarshipExecution: Cannot find valid spawn location near port at ${this.patrolCenterTile}`);
        this.active = false;
        return;
      }
      const spawn = this._owner.canBuild(this.unitType, spawnTile);
      if (spawn === false) {
        this.active = false;
        return;
      }
      this.warship = this._owner.buildUnit(this.unitType, spawn, {});
      return;
    }
    if (!this.warship.isActive()) {
      this.active = false;
      return;
    }

    // Clear inactive targets
    if (this.target !== undefined && !this.target.isActive()) {
      this.target = undefined;
    }

    // Check for nuke targets first (only for Condors)
    if (this.warship.type() === UnitType.Condor) {
      const nukeTarget = this.getNukeTarget();

      // Use 20 second cooldown
      if (
        nukeTarget &&
        this.mg.ticks() - this.lastNukeIntercept > this.NUKE_INTERCEPT_COOLDOWN
      ) {
        // Check if nuke is still in range and active
        if (
          nukeTarget.isActive() &&
          this.mg.manhattanDist(nukeTarget.tile(), this.warship.tile()) <=
            this.nukeSearchRadius
        ) {
          this.lastNukeIntercept = this.mg.ticks();

          // Mark the nuke as being targeted (like SAMs do)
          nukeTarget.setTargetedBySAM(true);

          // Launch missile at nuke with proper travel time
          this.mg.displayMessage(
            `Condor launching missile at ${nukeTarget.type()}!`,
            MessageType.INFO,
            this._owner.id(),
          );

          this.mg.addExecution(
            new CondorMissileExecution(
              this.warship.tile(),
              this._owner,
              this.warship,
              nukeTarget,
            ),
          );
        }
      }
    }

    const hasPort = this._owner.units(UnitType.Port).length > 0;
    const warship = this.warship;
    if (warship === undefined) throw new Error("Warship not initialized");

    // Get all targetable units - ships and buildings with health
    const targetableUnits = [
      ...this.mg.nearbyUnits(
        this.warship.tile(),
        this.mg.config().warshipTargettingRange(),
        [
          UnitType.TransportShip,
          UnitType.Viper,
          UnitType.Condor,
          UnitType.TradeShip,
        ],
      ),
      ...this.mg.nearbyUnits(
        this.warship.tile(),
        this.mg.config().warshipTargettingRange(),
        [
          UnitType.DefensePost,
          UnitType.SAMLauncher,
          UnitType.OrbitalCannon,
          UnitType.City,
          UnitType.Port,
          UnitType.MissileSilo,
        ],
      ),
    ].filter(
      ({ unit }) =>
        unit.owner() !== warship.owner() &&
        unit !== warship &&
        !unit.owner().isFriendly(warship.owner()) &&
        !this.alreadySentShell.has(unit) &&
        // Condors ignore trade ships entirely
        (this.unitType === UnitType.Condor
          ? unit.type() !== UnitType.TradeShip
          : true) &&
        (unit.type() !== UnitType.TradeShip ||
          (hasPort &&
            this.warship !== null &&
            unit.targetUnit()?.owner() !== this.warship.owner() &&
            !unit.targetUnit()?.owner().isFriendly(this.warship.owner()) &&
            unit.isSafeFromPirates() !== true)),
    );

    this.target = targetableUnits.sort((a, b) => {
      const { unit: unitA, distSquared: distA } = a;
      const { unit: unitB, distSquared: distB } = b;

      // Prioritize Warships
      if (
        (unitA.type() === UnitType.Viper || unitA.type() === UnitType.Condor) &&
        unitB.type() !== UnitType.Viper &&
        unitB.type() !== UnitType.Condor
      )
        return -1;
      if (
        unitA.type() !== UnitType.Viper &&
        unitA.type() !== UnitType.Condor &&
        (unitB.type() === UnitType.Viper || unitB.type() === UnitType.Condor)
      )
        return 1;

      // Then prioritize Orbital Cannons (they're the most dangerous to ships)
      if (
        unitA.type() === UnitType.OrbitalCannon &&
        unitB.type() !== UnitType.OrbitalCannon
      )
        return -1;
      if (
        unitA.type() !== UnitType.OrbitalCannon &&
        unitB.type() === UnitType.OrbitalCannon
      )
        return 1;

      // Then favor Transport Ships over Trade Ships
      if (
        unitA.type() === UnitType.TransportShip &&
        unitB.type() !== UnitType.TransportShip
      )
        return -1;
      if (
        unitA.type() !== UnitType.TransportShip &&
        unitB.type() === UnitType.TransportShip
      )
        return 1;

      // If both are the same type, sort by distance (lower `distSquared` means closer)
      return distA - distB;
    })[0]?.unit;

    const moveTarget = this.warship.targetTile();
    if (moveTarget) {
      this.goToMoveTarget(moveTarget);
      // If we have a "move target" then we cannot target trade ships as it
      // requires moving.
      if (this.target && this.target.type() === UnitType.TradeShip) {
        this.target = undefined;
      }
    } else if (!this.target || this.target.type() !== UnitType.TradeShip) {
      this.patrol();
    }

    if (
      this.target === undefined ||
      !this.target.isActive() ||
      this.target.owner() === this._owner ||
      this.target.isSafeFromPirates() === true
    ) {
      // In case another warship captured or destroyed target, or the target escaped into safe waters
      this.target = undefined;
      return;
    }

    this.warship.setTargetUnit(this.target);

    // If we have a move target we do not want to go after trading ships
    if (!this.target) {
      return;
    }

    if (this.target.type() !== UnitType.TradeShip) {
      // Shoot at all non-trade ship targets (including buildings)
      this.shoot();
      return;
    }

    for (let i = 0; i < 2; i++) {
      // target is trade ship so capture it.
      const result = this.pathfinder.nextTile(
        this.warship.tile(),
        this.target.tile(),
        5,
      );
      switch (result.type) {
        case PathFindResultType.Completed:
          this._owner.captureUnit(this.target);
          this.target = undefined;
          this.warship.move(this.warship.tile());
          return;
        case PathFindResultType.NextTile:
          this.warship.move(result.tile);
          break;
        case PathFindResultType.Pending:
          this.warship.move(this.warship.tile());
          break;
        case PathFindResultType.PathNotFound:
          consolex.log(`path not found to target`);
          break;
      }
    }
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }

  private findSpawnLocationNearPort(portTile: TileRef): TileRef | null {
    if (this.mg === null) {
      throw new Error("Warship not initialized");
    }

    // First try adjacent tiles, preferring water
    const neighbors = this.mg.neighbors(portTile);

    // Prioritize water tiles that can have a warship built on them
    for (const tile of neighbors) {
      if (this.mg.isOcean(tile) && this._owner.canBuild(this.unitType, tile) !== false) {
        return tile;
      }
    }

    // If no water tiles available, try any valid adjacent tile (amphibious)
    for (const tile of neighbors) {
      if (this.mg.isLand(tile) && this._owner.canBuild(this.unitType, tile) !== false) {
        return tile;
      }
    }

    // Try a wider search radius (2 tiles away)
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        if (Math.abs(dx) + Math.abs(dy) > 2) continue; // Manhattan distance <= 2

        const x = this.mg.x(portTile) + dx;
        const y = this.mg.y(portTile) + dy;

        if (!this.mg.isValidCoord(x, y)) continue;

        const tile = this.mg.ref(x, y);
        // Prefer ocean but accept land (amphibious)
        if (this.mg.isOcean(tile) && this._owner.canBuild(this.unitType, tile) !== false) {
          return tile;
        }
      }
    }

    // Last resort: try land tiles in wider radius
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        if (Math.abs(dx) + Math.abs(dy) > 2) continue;

        const x = this.mg.x(portTile) + dx;
        const y = this.mg.y(portTile) + dy;

        if (!this.mg.isValidCoord(x, y)) continue;

        const tile = this.mg.ref(x, y);
        if (this.mg.isLand(tile) && this._owner.canBuild(this.unitType, tile) !== false) {
          return tile;
        }
      }
    }

    return null;
  }

  randomTile(allowShoreline: boolean = false): TileRef | undefined {
    if (this.mg === null) {
      throw new Error("Warship not initialized");
    }
    let warshipPatrolRange = this.mg.config().warshipPatrolRange();
    const maxAttemptBeforeExpand: number = 500;
    let attempts: number = 0;
    let expandCount: number = 0;
    while (expandCount < 3) {
      const x =
        this.mg.x(this.patrolCenterTile) +
        this.random.nextInt(-warshipPatrolRange / 2, warshipPatrolRange / 2);
      const y =
        this.mg.y(this.patrolCenterTile) +
        this.random.nextInt(-warshipPatrolRange / 2, warshipPatrolRange / 2);
      if (!this.mg.isValidCoord(x, y)) {
        continue;
      }
      const tile = this.mg.ref(x, y);
      // Allow warships to patrol on any terrain (amphibious capability)
      // Only check shoreline restriction if specified
      if (!allowShoreline && this.mg.isShoreline(tile)) {
        attempts++;
        if (attempts === maxAttemptBeforeExpand) {
          expandCount++;
          attempts = 0;
          warshipPatrolRange =
            warshipPatrolRange + Math.floor(warshipPatrolRange / 2);
        }
        continue;
      }
      return tile;
    }
    console.warn(
      `Failed to find random tile for warship for ${this._owner.name()}`,
    );
    if (!allowShoreline) {
      // If we failed to find a tile on the ocean, try again but allow shoreline
      return this.randomTile(true);
    }
    return undefined;
  }
}
