import { consolex } from "../Consolex";
import {
  Cell,
  Difficulty,
  Execution,
  Game,
  Nation,
  Player,
  PlayerID,
  PlayerType,
  Relation,
  TerrainType,
  Tick,
  Unit,
  UnitType,
} from "../game/Game";
import { euclDistFN, manhattanDistFN, TileRef } from "../game/GameMap";
import { PseudoRandom } from "../PseudoRandom";
import { GameID } from "../Schemas";
import { calculateBoundingBox, flattenedEmojiTable, simpleHash } from "../Util";
import { ConstructionExecution } from "./ConstructionExecution";
import { EmojiExecution } from "./EmojiExecution";
import { NukeExecution } from "./NukeExecution";
import { SpawnExecution } from "./SpawnExecution";
import { TransportShipExecution } from "./TransportShipExecution";
import { closestTwoTiles } from "./Util";
import { BotBehavior } from "./utils/BotBehavior";

export class FakeHumanExecution implements Execution {
  private firstMove = true;

  private active = true;
  private random: PseudoRandom;
  private behavior: BotBehavior | null = null;
  private mg: Game;
  private player: Player | null = null;

  private attackRate: number;
  private attackTick: number;
  private triggerRatio: number;
  private reserveRatio: number;

  private lastEmojiSent = new Map<Player, Tick>();
  private lastNukeSent: [Tick, TileRef][] = [];
  private embargoMalusApplied = new Set<PlayerID>();
  private heckleEmoji: number[];

  // Enhanced AI properties
  private maxBuildings: number = 50;
  private maxWarships: number = 20;
  private buildRotationIndex: number = 0;
  private maxPatrolVipers: number = 10;

  constructor(
    gameID: GameID,
    private nation: Nation,
  ) {
    this.random = new PseudoRandom(
      simpleHash(nation.playerInfo.id) + simpleHash(gameID),
    );
    this.attackRate = this.random.nextInt(40, 80);
    this.attackTick = this.random.nextInt(0, this.attackRate);
    this.triggerRatio = this.random.nextInt(60, 90) / 100;
    this.reserveRatio = this.random.nextInt(30, 60) / 100;
    this.heckleEmoji = ["🤡", "😡"].map((e) => flattenedEmojiTable.indexOf(e));

    // Initialize enhanced AI properties - nations are powerful with 50 buildings
  }

  init(mg: Game) {
    this.mg = mg;
    if (this.random.chance(10)) {
      // this.isTraitor = true
    }
  }

  private updateRelationsFromEmbargos() {
    const player = this.player;
    if (player === null) return;
    const others = this.mg.players().filter((p) => p.id() !== player.id());

    others.forEach((other: Player) => {
      const embargoMalus = -20;
      if (
        other.hasEmbargoAgainst(player) &&
        !this.embargoMalusApplied.has(other.id())
      ) {
        player.updateRelation(other, embargoMalus);
        this.embargoMalusApplied.add(other.id());
      } else if (
        !other.hasEmbargoAgainst(player) &&
        this.embargoMalusApplied.has(other.id())
      ) {
        player.updateRelation(other, -embargoMalus);
        this.embargoMalusApplied.delete(other.id());
      }
    });
  }

  private handleEmbargoesToHostileNations() {
    const player = this.player;
    if (player === null) return;
    const others = this.mg.players().filter((p) => p.id() !== player.id());

    others.forEach((other: Player) => {
      /* When player is hostile starts embargo. Do not stop until neutral again */
      if (
        player.relation(other) <= Relation.Hostile &&
        !player.hasEmbargoAgainst(other)
      ) {
        player.addEmbargo(other.id(), false);
      } else if (
        player.relation(other) >= Relation.Neutral &&
        player.hasEmbargoAgainst(other)
      ) {
        player.stopEmbargo(other.id());
      }
    });
  }

  tick(ticks: number) {
    if (ticks % this.attackRate !== this.attackTick) return;

    if (this.mg.inSpawnPhase()) {
      const rl = this.randomLand();
      if (rl === null) {
        //consolex.warn(`cannot spawn ${this.nation.playerInfo.name}`);
        return;
      }
      this.mg.addExecution(new SpawnExecution(this.nation.playerInfo, rl));
      return;
    }

    if (this.player === null) {
      this.player =
        this.mg.players().find((p) => p.id() === this.nation.playerInfo.id) ??
        null;
      if (this.player === null) {
        return;
      }
    }

    if (!this.player.isAlive()) {
      this.active = false;
      return;
    }

    if (this.behavior === null) {
      // Player is unavailable during init()
      this.behavior = new BotBehavior(
        this.random,
        this.mg,
        this.player,
        this.triggerRatio,
        this.reserveRatio,
      );
    }

    if (this.firstMove) {
      this.firstMove = false;
      this.behavior.sendAttack(this.mg.terraNullius(), false);
      return;
    }

    if (
      this.player.troops() > 100_000 &&
      this.player.targetTroopRatio() > 0.7
    ) {
      this.player.setTargetTroopRatio(0.7);
    }

    this.updateRelationsFromEmbargos();
    this.behavior.handleAllianceRequests();
    this.handleEnemies();
    this.handleUnits();
    this.handleEmbargoesToHostileNations();
    this.maybeAttack();
  }

  private maybeAttack() {
    if (this.player === null || this.behavior === null) {
      throw new Error("not initialized");
    }
    const enemyborder = Array.from(this.player.borderTiles())
      .flatMap((t) => this.mg.neighbors(t))
      .filter(
        (t) =>
          this.mg.isLand(t) && this.mg.ownerID(t) !== this.player?.smallID(),
      );

    // If no enemy borders, we've conquered this landmass
    if (enemyborder.length === 0) {
      // Much higher chance to expand to other continents
      if (this.random.chance(50)) {
        this.maybeNavalInvasion();
      } else if (this.random.chance(30)) {
        this.sendBoatRandomly();
      }
      return;
    }

    // Even with enemies nearby, sometimes send naval invasions
    if (this.random.chance(20)) {
      if (this.isCurrentLandmassConquered()) {
        this.maybeNavalInvasion();
      } else {
        this.sendBoatRandomly();
      }
      return;
    }

    const enemiesWithTN = enemyborder.map((t) =>
      this.mg.playerBySmallID(this.mg.ownerID(t)),
    );
    if (enemiesWithTN.filter((o) => !o.isPlayer()).length > 0) {
      this.behavior.sendAttack(this.mg.terraNullius(), false);
      return;
    }

    const enemies = enemiesWithTN
      .filter((o) => o.isPlayer())
      .sort((a, b) => a.troops() - b.troops());

    // 5% chance to send a random alliance request
    if (this.random.chance(20)) {
      const toAlly = this.random.randElement(enemies);
      if (this.player.canSendAllianceRequest(toAlly)) {
        this.player.createAllianceRequest(toAlly);
        return;
      }
    }

    // 50-50 attack weakest player vs random player
    const toAttack = this.random.chance(2)
      ? enemies[0]
      : this.random.randElement(enemies);
    if (this.shouldAttack(toAttack)) {
      this.behavior.sendAttack(toAttack, false);
    }
  }

  private shouldAttack(other: Player): boolean {
    if (this.player === null) throw new Error("not initialized");
    if (this.player.isOnSameTeam(other)) {
      return false;
    }
    if (this.player.isFriendly(other)) {
      if (this.shouldDiscourageAttack(other)) {
        return this.random.chance(200);
      }
      return this.random.chance(50);
    } else {
      if (this.shouldDiscourageAttack(other)) {
        return this.random.chance(4);
      }
      return true;
    }
  }

  private shouldDiscourageAttack(other: Player) {
    if (other.isTraitor()) {
      return false;
    }
    const difficulty = this.mg.config().gameConfig().difficulty;
    if (
      difficulty === Difficulty.Hard ||
      difficulty === Difficulty.Impossible
    ) {
      return false;
    }
    if (other.type() !== PlayerType.Human) {
      return false;
    }
    // Only discourage attacks on Humans who are not traitors on easy or medium difficulty.
    return true;
  }

  handleEnemies() {
    if (this.player === null || this.behavior === null) {
      throw new Error("not initialized");
    }
    this.behavior.forgetOldEnemies();
    this.behavior.checkIncomingAttacks();
    this.behavior.assistAllies();
    const enemy = this.behavior.selectEnemy();
    if (!enemy) return;
    this.maybeSendEmoji(enemy);
    this.maybeSendNuke(enemy);
    if (this.player.sharesBorderWith(enemy)) {
      this.behavior.sendAttack(enemy, false);
    } else {
      this.maybeSendBoatAttack(enemy);
    }
  }

  private maybeSendEmoji(enemy: Player) {
    if (this.player === null) throw new Error("not initialized");
    if (enemy.type() !== PlayerType.Human) return;
    const lastSent = this.lastEmojiSent.get(enemy) ?? -300;
    if (this.mg.ticks() - lastSent <= 300) return;
    this.lastEmojiSent.set(enemy, this.mg.ticks());
    this.mg.addExecution(
      new EmojiExecution(
        this.player.id(),
        enemy.id(),
        this.random.randElement(this.heckleEmoji),
      ),
    );
  }

  private maybeSendNuke(other: Player) {
    if (this.player === null) throw new Error("not initialized");
    const silos = this.player.units(UnitType.MissileSilo);
    if (
      silos.length === 0 ||
      this.player.gold() < this.cost(UnitType.AtomBomb) ||
      other.type() === PlayerType.Bot ||
      this.player.isOnSameTeam(other)
    ) {
      return;
    }

    const structures = other.units(
      UnitType.City,
      UnitType.DefensePost,
      UnitType.MissileSilo,
      UnitType.Port,
      UnitType.SAMLauncher,
    );
    const structureTiles = structures.map((u) => u.tile());
    const randomTiles: (TileRef | null)[] = new Array(10);
    for (let i = 0; i < randomTiles.length; i++) {
      randomTiles[i] = this.randTerritoryTile(other);
    }
    const allTiles = randomTiles.concat(structureTiles);

    let bestTile: TileRef | null = null;
    let bestValue = 0;
    this.removeOldNukeEvents();
    outer: for (const tile of new Set(allTiles)) {
      if (tile === null) continue;
      for (const t of this.mg.bfs(tile, manhattanDistFN(tile, 15))) {
        // Make sure we nuke at least 15 tiles in border
        if (this.mg.owner(t) !== other) {
          continue outer;
        }
      }
      if (!this.player.canBuild(UnitType.AtomBomb, tile)) continue;
      const value = this.nukeTileScore(tile, silos, structures);
      if (value > bestValue) {
        bestTile = tile;
        bestValue = value;
      }
    }
    if (bestTile !== null) {
      this.sendNuke(bestTile);
    }
  }

  private removeOldNukeEvents() {
    const maxAge = 500;
    const tick = this.mg.ticks();
    while (
      this.lastNukeSent.length > 0 &&
      this.lastNukeSent[0][0] + maxAge < tick
    ) {
      this.lastNukeSent.shift();
    }
  }

  private sendNuke(tile: TileRef) {
    if (this.player === null) throw new Error("not initialized");
    const tick = this.mg.ticks();
    this.lastNukeSent.push([tick, tile]);
    this.mg.addExecution(
      new NukeExecution(UnitType.AtomBomb, this.player.id(), tile),
    );
  }

  private nukeTileScore(tile: TileRef, silos: Unit[], targets: Unit[]): number {
    // Potential damage in a 25-tile radius
    const dist = euclDistFN(tile, 25, false);
    let tileValue = targets
      .filter((unit) => dist(this.mg, unit.tile()))
      .map((unit) => {
        switch (unit.type()) {
          case UnitType.City:
            return 25_000;
          case UnitType.DefensePost:
            return 5_000;
          case UnitType.MissileSilo:
            return 50_000;
          case UnitType.Port:
            return 10_000;
          case UnitType.SAMLauncher:
            return 5_000;
          default:
            return 0;
        }
      })
      .reduce((prev, cur) => prev + cur, 0);

    // Prefer tiles that are closer to a silo
    const siloTiles = silos.map((u) => u.tile());
    const result = closestTwoTiles(this.mg, siloTiles, [tile]);
    if (result === null) throw new Error("Missing result");
    const { x: closestSilo } = result;
    const distanceSquared = this.mg.euclideanDistSquared(tile, closestSilo);
    const distanceToClosestSilo = Math.sqrt(distanceSquared);
    tileValue -= distanceToClosestSilo * 30;

    // Don't target near recent targets
    tileValue -= this.lastNukeSent
      .filter(([_tick, tile]) => dist(this.mg, tile))
      .map((_) => 1_000_000)
      .reduce((prev, cur) => prev + cur, 0);

    return tileValue;
  }

  private maybeSendBoatAttack(other: Player) {
    if (this.player === null) throw new Error("not initialized");
    if (this.player.isOnSameTeam(other)) return;
    const closest = closestTwoTiles(
      this.mg,
      Array.from(this.player.borderTiles()).filter((t) =>
        this.mg.isOceanShore(t),
      ),
      Array.from(other.borderTiles()).filter((t) => this.mg.isOceanShore(t)),
    );
    if (closest === null) {
      return;
    }
    this.mg.addExecution(
      new TransportShipExecution(
        this.player.id(),
        other.id(),
        closest.y,
        this.player.troops() / 5,
        null,
      ),
    );
  }

  private handleUnits() {
    const player = this.player;
    if (player === null) return;

    // Count current buildings and warships
    const cities = player.units(UnitType.City);
    const ports = player.units(UnitType.Port);
    const silos = player.units(UnitType.MissileSilo);
    const orbitals = player.units(UnitType.OrbitalCannon);
    const sams = player.units(UnitType.SAMLauncher);
    const vipers = player.units(UnitType.Viper);
    const condors = player.units(UnitType.Condor);
    const totalBuildings = cities.length + ports.length + silos.length + orbitals.length + sams.length;
    const totalWarships = vipers.length + condors.length;

    // Check if we've reached building limit
    if (totalBuildings >= this.maxBuildings) {
      // Maybe send vipers on patrol if we have them
      this.sendViperPatrols();
      return;
    }

    // Build priority system with 50 building cap
    // Priority: Ports (15) -> Cities (25) -> Warships -> Silos (5) -> Defenses
    const rotationOptions = [
      { type: 'port', condition: () => ports.length < 15 && this.hasOceanAccess() },
      { type: 'city', condition: () => cities.length < 25 },
      { type: 'warship', condition: () => ports.length > 0 && totalWarships < this.maxWarships },
      { type: 'silo', condition: () => silos.length < 5 },
      { type: 'orbital', condition: () => orbitals.length < 3 && this.random.chance(30) },
      { type: 'sam', condition: () => sams.length < 2 && this.random.chance(20) },
    ];

    // Try to build based on rotation
    for (let attempts = 0; attempts < rotationOptions.length; attempts++) {
      const option = rotationOptions[this.buildRotationIndex % rotationOptions.length];
      this.buildRotationIndex++;

      if (!option.condition()) continue;

      let built = false;
      switch (option.type) {
        case 'port':
          built = this.buildPort();
          break;
        case 'city':
          built = this.maybeSpawnStructure(UnitType.City, 25);
          break;
        case 'warship':
          // Implement 1:3 Condor to Viper ratio
          if (vipers.length >= (condors.length + 1) * 3) {
            built = this.buildCondor();
            if (!built) built = this.buildViper(); // Fallback to Viper if Condor fails
          } else {
            built = this.buildViper();
          }
          break;
        case 'silo':
          built = this.maybeSpawnStructure(UnitType.MissileSilo, 5);
          break;
        case 'orbital':
          built = this.maybeSpawnStructure(UnitType.OrbitalCannon, 3);
          if (built) consolex.log(`Nation ${this.nation.playerInfo.name}: Building Orbital Cannon`);
          break;
        case 'sam':
          built = this.maybeSpawnStructure(UnitType.SAMLauncher, 2);
          if (built) consolex.log(`Nation ${this.nation.playerInfo.name}: Building SAM Site`);
          break;
      }

      if (built) {
        // After building a warship, maybe send some on patrol
        if (option.type === 'warship') {
          this.sendViperPatrols();
        }
        return;
      }
    }
  }

  private hasOceanAccess(): boolean {
    if (this.player === null) return false;
    return Array.from(this.player.borderTiles()).some((t) =>
      this.mg.isOceanShore(t)
    );
  }

  private buildPort(): boolean {
    if (this.player === null) return false;
    const oceanTiles = Array.from(this.player.borderTiles()).filter((t) =>
      this.mg.isOceanShore(t),
    );
    if (oceanTiles.length > 0 && this.player.gold() > this.cost(UnitType.Port)) {
      const buildTile = this.random.randElement(oceanTiles);
      this.mg.addExecution(
        new ConstructionExecution(this.player.id(), buildTile, UnitType.Port),
      );
      return true;
    }
    return false;
  }

  private buildViper(): boolean {
    if (this.player === null) return false;
    const ports = this.player.units(UnitType.Port);
    if (ports.length === 0) return false;

    const port = this.random.randElement(ports);
    const targetTile = this.warshipSpawnTile(port.tile());
    if (targetTile !== null && this.player.canBuild(UnitType.Viper, targetTile) !== false) {
      this.mg.addExecution(
        new ConstructionExecution(this.player.id(), targetTile, UnitType.Viper),
      );
      consolex.log(`Nation ${this.nation.playerInfo.name}: Building Viper`);
      return true;
    }
    return false;
  }

  private buildCondor(): boolean {
    if (this.player === null) return false;
    const ports = this.player.units(UnitType.Port);
    if (ports.length === 0) return false;

    const port = this.random.randElement(ports);
    const targetTile = this.warshipSpawnTile(port.tile());
    if (targetTile !== null && this.player.canBuild(UnitType.Condor, targetTile) !== false) {
      this.mg.addExecution(
        new ConstructionExecution(this.player.id(), targetTile, UnitType.Condor),
      );
      consolex.log(`Nation ${this.nation.playerInfo.name}: Building Condor`);
      return true;
    }
    return false;
  }

  private maybeSpawnStructure(type: UnitType, maxNum: number): boolean {
    if (this.player === null) throw new Error("not initialized");
    const units = this.player.units(type);
    if (units.length >= maxNum) {
      return false;
    }
    if (this.player.gold() < this.cost(type)) {
      return false;
    }
    const tile = this.randTerritoryTile(this.player);
    if (tile === null) {
      return false;
    }
    const canBuild = this.player.canBuild(type, tile);
    if (canBuild === false) {
      return false;
    }
    this.mg.addExecution(
      new ConstructionExecution(this.player.id(), tile, type),
    );
    return true;
  }


  private randTerritoryTile(p: Player): TileRef | null {
    const boundingBox = calculateBoundingBox(this.mg, p.borderTiles());
    for (let i = 0; i < 100; i++) {
      const randX = this.random.nextInt(boundingBox.min.x, boundingBox.max.x);
      const randY = this.random.nextInt(boundingBox.min.y, boundingBox.max.y);
      if (!this.mg.isOnMap(new Cell(randX, randY))) {
        // Sanity check should never happen
        continue;
      }
      const randTile = this.mg.ref(randX, randY);
      if (this.mg.owner(randTile) === p) {
        return randTile;
      }
    }
    return null;
  }

  private warshipSpawnTile(portTile: TileRef): TileRef | null {
    const radius = 250;
    for (let attempts = 0; attempts < 50; attempts++) {
      const randX = this.random.nextInt(
        this.mg.x(portTile) - radius,
        this.mg.x(portTile) + radius,
      );
      const randY = this.random.nextInt(
        this.mg.y(portTile) - radius,
        this.mg.y(portTile) + radius,
      );
      if (!this.mg.isValidCoord(randX, randY)) {
        continue;
      }
      const tile = this.mg.ref(randX, randY);
      // Sanity check
      if (!this.mg.isOcean(tile)) {
        continue;
      }
      return tile;
    }
    return null;
  }

  private cost(type: UnitType): number {
    if (this.player === null) throw new Error("not initialized");
    return this.mg.unitInfo(type).cost(this.player);
  }

  sendBoatRandomly() {
    if (this.player === null) throw new Error("not initialized");
    const oceanShore = Array.from(this.player.borderTiles()).filter((t) =>
      this.mg.isOceanShore(t),
    );
    if (oceanShore.length === 0) {
      return;
    }

    const src = this.random.randElement(oceanShore);

    const dst = this.randOceanShoreTile(src, 150);
    if (dst === null) {
      return;
    }

    this.mg.addExecution(
      new TransportShipExecution(
        this.player.id(),
        this.mg.owner(dst).id(),
        dst,
        this.player.troops() / 5,
        null,
      ),
    );
    return;
  }

  randomLand(): TileRef | null {
    const delta = 25;
    let tries = 0;
    while (tries < 50) {
      tries++;
      const cell = this.nation.spawnCell;
      const x = this.random.nextInt(cell.x - delta, cell.x + delta);
      const y = this.random.nextInt(cell.y - delta, cell.y + delta);
      if (!this.mg.isValidCoord(x, y)) {
        continue;
      }
      const tile = this.mg.ref(x, y);
      if (this.mg.isLand(tile) && !this.mg.hasOwner(tile)) {
        if (
          this.mg.terrainType(tile) === TerrainType.Mountain &&
          this.random.chance(2)
        ) {
          continue;
        }
        return tile;
      }
    }
    return null;
  }

  private randOceanShoreTile(tile: TileRef, dist: number): TileRef | null {
    if (this.player === null) throw new Error("not initialized");
    const x = this.mg.x(tile);
    const y = this.mg.y(tile);
    for (let i = 0; i < 500; i++) {
      const randX = this.random.nextInt(x - dist, x + dist);
      const randY = this.random.nextInt(y - dist, y + dist);
      if (!this.mg.isValidCoord(randX, randY)) {
        continue;
      }
      const randTile = this.mg.ref(randX, randY);
      if (!this.mg.isOceanShore(randTile)) {
        continue;
      }
      const owner = this.mg.owner(randTile);
      if (!owner.isPlayer()) {
        return randTile;
      }
      if (!owner.isFriendly(this.player)) {
        return randTile;
      }
    }
    return null;
  }

  private isCurrentLandmassConquered(): boolean {
    if (this.player === null) return false;

    // Check if any hostile land borders exist
    const enemyLandBorders = Array.from(this.player.borderTiles())
      .flatMap((t) => this.mg.neighbors(t))
      .filter((t) => {
        if (!this.mg.isLand(t) || this.mg.ownerID(t) === this.player!.smallID()) {
          return false;
        }

        const owner = this.mg.playerBySmallID(this.mg.ownerID(t));
        return owner.isPlayer() && !this.player!.isFriendly(owner);
      });

    return enemyLandBorders.length === 0; // No hostile land borders = landmass conquered
  }

  private findClosestEnemyLandmass(): { shoreTile: TileRef, targetOwner: Player, distance: number } | null {
    if (this.player === null) return null;

    const playerShores = Array.from(this.player.borderTiles()).filter((t) =>
      this.mg.isOceanShore(t),
    );

    if (playerShores.length === 0) return null;

    let closestTarget: { shoreTile: TileRef, targetOwner: Player, distance: number } | null = null;
    let minDistance = Infinity;

    // Search in expanding radius for enemy shores
    const searchRadii = [1000, 2000, 3000, 4000, 5000];

    for (const radius of searchRadii) {
      for (const playerShore of playerShores) {
        const enemyShore = this.findEnemyShoreInRadius(playerShore, radius);
        if (enemyShore !== null) {
          const distance = this.mg.euclideanDistSquared(playerShore, enemyShore.shoreTile);
          if (distance < minDistance) {
            minDistance = distance;
            closestTarget = {
              shoreTile: enemyShore.shoreTile,
              targetOwner: enemyShore.targetOwner,
              distance: Math.sqrt(distance)
            };
          }
        }
      }

      // If we found targets at this radius, prioritize closest ones
      if (closestTarget !== null) {
        break;
      }
    }

    return closestTarget;
  }

  private findEnemyShoreInRadius(centerTile: TileRef, radius: number): { shoreTile: TileRef, targetOwner: Player } | null {
    const centerX = this.mg.x(centerTile);
    const centerY = this.mg.y(centerTile);
    const rand = this.random.nextFloat(0.0, 1.0);
    // Sample random points in radius to find enemy shores
    for (let i = 0; i < 100; i++) {
      const angle = (Math.PI * 2 * i) / 100; // Systematic circular sampling
      const randRadius = radius * (0.5 + rand * 0.5); // Sample outer half of radius
      const randX = Math.floor(centerX + randRadius * Math.cos(angle));
      const randY = Math.floor(centerY + randRadius * Math.sin(angle));

      if (!this.mg.isValidCoord(randX, randY)) continue;

      const tile = this.mg.ref(randX, randY);
      if (!this.mg.isOceanShore(tile)) continue;

      const owner = this.mg.owner(tile);
      if (!owner.isPlayer() || this.player!.isFriendly(owner)) continue;

      return { shoreTile: tile, targetOwner: owner };
    }

    return null;
  }

  private maybeNavalInvasion() {
    if (this.player === null) throw new Error("not initialized");

    // Check if current landmass is fully conquered
    if (!this.isCurrentLandmassConquered()) {
      return; // Still have local expansion opportunities
    }

    // Need ocean access for naval invasions
    const oceanShore = Array.from(this.player.borderTiles()).filter((t) =>
      this.mg.isOceanShore(t),
    );
    if (oceanShore.length === 0) return;

    // Find closest enemy landmass
    const targetLandmass = this.findClosestEnemyLandmass();
    if (targetLandmass === null) return;

    const vipers = this.player.units(UnitType.Viper);
    const condors = this.player.units(UnitType.Condor);
    const warships = [...vipers, ...condors];

    // Deploy warship patrol near target landmass
    if (warships.length > 0) {
      this.deployWarshipPatrol(targetLandmass.shoreTile, warships);
    }

    // Launch invasion transport
    this.mg.addExecution(
      new TransportShipExecution(
        this.player.id(),
        targetLandmass.targetOwner.id(),
        targetLandmass.shoreTile,
        this.player.troops() / 3, // Larger force for distant invasions
        null,
      ),
    );
    consolex.log(`Nation ${this.nation.playerInfo.name}: Launching invasion of distant landmass (distance: ${targetLandmass.distance})`);
  }

  private deployWarshipPatrol(targetShoreTile: TileRef, warships: Unit[]) {
    if (this.player === null || warships.length === 0) return;

    // Select up to 3 warships for patrol duty
    const patrolShips = warships.slice(0, Math.min(3, warships.length));

    for (const ship of patrolShips) {
      // Position warships near target landmass for patrol/support
      const patrolX = this.mg.x(targetShoreTile) + this.random.nextInt(-200, 200);
      const patrolY = this.mg.y(targetShoreTile) + this.random.nextInt(-200, 200);

      if (this.mg.isValidCoord(patrolX, patrolY)) {
        const patrolTile = this.mg.ref(patrolX, patrolY);
        if (this.mg.isOcean(patrolTile)) {
          ship.setTargetTile(patrolTile);
          consolex.log(`Nation ${this.nation.playerInfo.name}: Deployed ${ship.type()} patrol near invasion target`);
        }
      }
    }
  }

  private sendViperPatrols() {
    if (this.player === null) return;

    const vipers = this.player.units(UnitType.Viper);
    if (vipers.length === 0) return;

    // Get vipers that aren't already on patrol (no target tile set)
    const availableVipers = vipers.filter(v => !v.targetTile());
    if (availableVipers.length === 0) return;

    // Send up to maxPatrolVipers on patrol
    const vipersToPatrol = Math.min(availableVipers.length, this.maxPatrolVipers);
    const patrolVipers = availableVipers.slice(0, vipersToPatrol);

    for (const viper of patrolVipers) {
      // Find a random ocean tile for patrol
      const patrolTile = this.findRandomOceanTile();
      if (patrolTile) {
        viper.setTargetTile(patrolTile);
        consolex.log(`Nation ${this.nation.playerInfo.name}: Sent Viper on deep space patrol`);
      }
    }
  }

  private findRandomOceanTile(): TileRef | null {
    if (this.player === null) return null;

    // Get player's ocean shores as starting points
    const oceanShores = Array.from(this.player.borderTiles()).filter((t) =>
      this.mg.isOceanShore(t)
    );
    if (oceanShores.length === 0) return null;

    const startTile = this.random.randElement(oceanShores);
    const radius = this.random.nextInt(300, 800); // Patrol far out
    const rand = this.random.nextFloat(0.0, 1.0);
    for (let attempts = 0; attempts < 20; attempts++) {
      const angle = rand * Math.PI * 2;
      const distance = radius * (0.5 + rand * 0.5);
      const x = Math.floor(this.mg.x(startTile) + distance * Math.cos(angle));
      const y = Math.floor(this.mg.y(startTile) + distance * Math.sin(angle));

      if (this.mg.isValidCoord(x, y)) {
        const tile = this.mg.ref(x, y);
        if (this.mg.isOcean(tile)) {
          return tile;
        }
      }
    }

    return null;
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return true;
  }
}