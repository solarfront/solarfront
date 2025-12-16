import { consolex } from "../Consolex";
import {
  Cell,
  Difficulty,
  Execution,
  Game,
  Player,
  PlayerID,
  PlayerType,
  Relation,
  Tick,
  UnitType,
} from "../game/Game";
import { manhattanDistFN, TileRef } from "../game/GameMap";
import { PseudoRandom } from "../PseudoRandom";
import { simpleHash } from "../Util";
import { ConstructionExecution } from "./ConstructionExecution";
import { NukeExecution } from "./NukeExecution";
import { TransportShipExecution } from "./TransportShipExecution";
import { BotBehavior } from "./utils/BotBehavior";
import { closestTwoTiles } from "./Util";

/**
 * AutoPlayExecution - AI control for human players who enable auto-play
 * Based on FakeHumanExecution but with fair play adjustments:
 * - No strength modifiers (always plays as strength 1)
 * - Reduced nuclear aggressiveness (10% vs 20-30%)
 * - Initial delay before first action (5-10 seconds)
 */
export class AutoPlayExecution implements Execution {
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
  private autoBuild: boolean;
  private autoShip: boolean;
  private autoAttack: boolean;
  private targetTroopRatio: number;
  // Remove hardcoded attackRatio - will read from UI state dynamically
  
  // Initial delay for fairness (5-10 seconds = 50-100 ticks)
  private initialDelayTicks: number;
  private ticksElapsed = 0;
  
  private lastEmojiSent = new Map<Player, Tick>();
  private lastNukeSent: [Tick, TileRef][] = [];
  private embargoMalusApplied = new Set<PlayerID>();
  
  // Focused attack system
  private committedTarget: Player | null = null;
  private targetCommittedAt: Tick = 0;
  private targetSwitchCooldown: number = 1800; // 3 minutes before switching
  
  // Progressive target priority system
  private currentTargetPriority: number = 1; // 1=Bots, 2=Nations, 3=Humans
  private lastPriorityCheck: Tick = 0;
  
  // Build rotation system for balanced empire growth
  private buildRotationIndex: number = 0;
  private lastBuildAttempt: Tick = 0;
  private buildCooldown: number = 50; // 5 seconds between build attempts
  // Defense post removed from early building phase
  
  // Attack delay system to prevent rapid-fire attacks
  private lastAttackTime: Tick = 0;
  private attackCooldown: number = 30; // 3 seconds between attacks
  
  constructor(
    private playerID: PlayerID,
    gameID: string,
    skipInitialDelay: boolean = false,
    autoBuild: boolean = true,
    autoShip: boolean = true,
    autoAttack: boolean = true,
    private getUIAttackRatio: () => number = () => 0.2, // Default to 20% if no UI state available
  ) {
    this.random = new PseudoRandom(
      simpleHash(playerID) + simpleHash(gameID),
    );

    this.autoBuild = autoBuild;
    this.autoShip = autoShip;
    this.autoAttack = autoAttack;

    // Force fresh BotBehavior creation with correct ratios
    this.behavior = null;

    // Default troop ratio (80% troops, 20% workers)
    this.targetTroopRatio = 0.8;

    console.log(`AutoPlay DEBUG: Created with features - Build: ${autoBuild}, Ship: ${autoShip}, Attack: ${autoAttack}, AttackRatio: will read from UI state`);

    // Standard attack frequency
    this.attackRate = this.random.nextInt(25, 35);  // 2.5-3.5 seconds
    
    this.attackTick = this.random.nextInt(0, this.attackRate);
    this.triggerRatio = this.random.nextInt(60, 90) / 100;
    // NOTE: reserveRatio is calculated from attackRatio when creating BotBehavior - don't override it here!
    
    console.log(`AutoPlay DEBUG: AttackRate: ${this.attackRate} ticks (${this.attackRate/10}s), TriggerRatio: ${this.triggerRatio}`);
    
    // Add initial delay for fairness, unless skipped (for default auto-play)
    this.initialDelayTicks = skipInitialDelay ? 0 : this.random.nextInt(50, 100);
  }
  
  init(mg: Game) {
    this.mg = mg;
    // Find player by ID - we'll need to search through players
    this.player = this.mg.players().find(p => p.id() === this.playerID) ?? null;
  }
  
  isActive(): boolean {
    return this.active;
  }
  
  activeDuringSpawnPhase(): boolean {
    return false; // Don't interfere with manual spawn
  }

  // Method to update attack ratio dynamically
  updateAttackRatio(newAttackRatio: number) {
    console.log(`AutoPlay DEBUG: Attack ratio updated from UI: ${newAttackRatio}`);
    this.getUIAttackRatio = () => newAttackRatio;
  }
  
  tick(ticks: number) {
    // Apply initial delay
    if (this.ticksElapsed < this.initialDelayTicks) {
      this.ticksElapsed++;
      return;
    }
    
    if (ticks % this.attackRate !== this.attackTick) {
      // Uncomment to debug timing: console.log(`AutoPlay DEBUG: Skipping tick ${ticks}, need ${ticks % this.attackRate} === ${this.attackTick}`);
      return;
    }
    
    console.log(`AutoPlay DEBUG: Attack tick reached! Tick: ${ticks}, Features - Build: ${this.autoBuild}, Ship: ${this.autoShip}, Attack: ${this.autoAttack}`);
    
    if (this.player === null) {
      this.player = this.mg.players().find(p => p.id() === this.playerID) ?? null;
      if (this.player === null) {
        return;
      }
    }
    
    if (!this.player.isAlive()) {
      this.active = false;
      return;
    }
    
    if (this.behavior === null) {
      console.log(`AutoPlay DEBUG: Creating BotBehavior - AttackRatio: will read from UI state dynamically`);
      
      this.behavior = new BotBehavior(
        this.random,
        this.mg,
        this.player,
        this.triggerRatio,
        this.getUIAttackRatio, // Pass the function to get current UI attack ratio
      );
    }
    
    // First attack to expand
    if (this.firstMove && this.autoAttack) {
      this.firstMove = false;
      this.behavior.sendAttack(this.mg.terraNullius(), false);
      return;
    } else if (this.firstMove && !this.autoAttack) {
      this.firstMove = false;
      // Skip the first attack if autoAttack is disabled
    }
    
    // Set troop ratio
    if (this.player.targetTroopRatio() !== this.targetTroopRatio) {
      this.player.setTargetTroopRatio(this.targetTroopRatio);
    }

    // Core AI behaviors
    this.updateRelationsFromEmbargos();
    this.behavior.handleAllianceRequests();
    if (this.autoAttack) {
      this.handleEnemies();
    }
    if (this.autoBuild) {
      this.handleUnits();
    }
    this.handleEmbargoesToHostileNations();
    if (this.autoAttack) {
      this.maybeAttack();
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
  
  private handleEnemies() {
    if (this.player === null || this.behavior === null) {
      throw new Error("not initialized");
    }
    this.behavior.forgetOldEnemies();
    
    // Check for incoming attacks - this automatically sets highest priority attacker as enemy
    this.behavior.checkIncomingAttacks();
    
    // If under attack, override committed target with the attacker for immediate retaliation
    const incomingAttacks = this.player.incomingAttacks();
    if (incomingAttacks.length > 0) {
      const primaryAttacker = incomingAttacks
        .sort((a, b) => b.troops() - a.troops())[0]
        .attacker();
      
      if (primaryAttacker !== this.committedTarget) {
        this.committedTarget = primaryAttacker;
        this.targetCommittedAt = this.mg.ticks();
        this.lastAttackTime = 0; // Reset attack cooldown for immediate retaliation
        consolex.log(`AutoPlay: UNDER ATTACK! Switching target to primary attacker with ${primaryAttacker.troops()} troops`);
      }
    }
    
    this.behavior.assistAllies();
    const enemy = this.behavior.selectEnemy();
    if (!enemy) return;
    
    // Reduced nuclear aggressiveness for auto-play
    this.maybeSendNukeReduced(enemy);
    
    // Note: Attack logic removed to prevent dual targeting
    // All attacks now go through the focused maybeAttack() system
  }
  
  private maybeSendNukeReduced(enemy: Player) {
    if (this.player === null) throw new Error("not initialized");
    if (!this.autoAttack) return; // Check if auto attack is enabled

    // Reduced chance: 10% instead of 20-30% for nations
    if (!this.random.chance(10)) return;
    
    const silos = this.player.units(UnitType.MissileSilo);
    if (silos.length === 0) return;
    
    let highScoreTarget: TileRef | null = null;
    let highScore = 0;
    
    const tiles = Array.from(enemy.tiles());
    const samples = Math.min(100, tiles.length);
    for (let i = 0; i < samples; i++) {
      const tile = this.random.randElement(tiles);
      const score = this.random.nextInt(1, 1000); // Simplified scoring
      if (score > highScore) {
        highScore = score;
        highScoreTarget = tile;
      }
    }
    
    if (highScoreTarget === null) return;
    
    const silo = this.random.randElement(silos);
    this.mg.addExecution(
      new NukeExecution(UnitType.AtomBomb, this.player.id(), highScoreTarget, silo.tile()),
    );
    this.lastNukeSent.push([this.mg.ticks(), highScoreTarget]);
  }
  
  
  private maybeSendBoatAttack(other: Player) {
    if (this.player === null) throw new Error("not initialized");
    if (this.player.isOnSameTeam(other)) return;
    if (!this.autoShip) return; // Check if auto ship is enabled

    const closestShores = closestTwoTiles(
      this.mg,
      Array.from(this.player.borderTiles()).filter((t) =>
        this.mg.isOceanShore(t),
      ),
      Array.from(other.borderTiles()).filter((t) => this.mg.isOceanShore(t)),
    );
    
    if (closestShores === null) {
      return;
    }
    
    // Calculate troop allocation with priority-based bonus
    let troopAllocation = this.player.troops() / 5;
    const targetPriority = this.getPriorityForPlayer(other);
    const isHighPriorityTarget = targetPriority <= 2; // Bots and Nations get enhanced allocation
    
    if (isHighPriorityTarget) {
      troopAllocation *= 1.2; // 20% more troops for high-priority targets
    }
    
    this.mg.addExecution(
      new TransportShipExecution(
        this.player.id(),
        other.id(),
        closestShores.y,
        troopAllocation,
        null,
      ),
    );
    const priorityName = this.getPriorityName(targetPriority);
    const bonusText = isHighPriorityTarget ? ' (+20%)' : '';
    consolex.log(`AutoPlay: Launching naval invasion against ${priorityName}${bonusText}`);
  }
  
  
  private selectTargetByPriority(enemies: Player[]): { target: Player | null, priority: number } {
    const currentTick = this.mg.ticks();
    
    // Only recalculate priority every 30 ticks (3 seconds) to avoid excessive computation
    if (currentTick - this.lastPriorityCheck < 30) {
      // Use current priority level, just find targets within it
      const targetsAtCurrentPriority = this.getTargetsByPriority(enemies, this.currentTargetPriority);
      if (targetsAtCurrentPriority.length > 0) {
        return { 
          target: targetsAtCurrentPriority.sort((a, b) => a.troops() - b.troops())[0], 
          priority: this.currentTargetPriority 
        };
      }
    }
    
    this.lastPriorityCheck = currentTick;
    
    // Priority 1: Bots (highest priority)
    const bots = this.getTargetsByPriority(enemies, 1);
    if (bots.length > 0) {
      if (this.currentTargetPriority !== 1) {
        this.currentTargetPriority = 1;
        consolex.log("AutoPlay: Priority escalation - targeting BOTS");
      }
      return { target: bots.sort((a, b) => a.troops() - b.troops())[0], priority: 1 };
    }
    
    // Priority 2: Nations/FakeHumans 
    const nations = this.getTargetsByPriority(enemies, 2);
    if (nations.length > 0) {
      if (this.currentTargetPriority !== 2) {
        this.currentTargetPriority = 2;
        consolex.log("AutoPlay: Priority escalation - targeting NATIONS");
      }
      return { target: nations.sort((a, b) => a.troops() - b.troops())[0], priority: 2 };
    }
    
    // Priority 3: Real Players (lowest priority)
    const humans = this.getTargetsByPriority(enemies, 3);
    if (humans.length > 0) {
      if (this.currentTargetPriority !== 3) {
        this.currentTargetPriority = 3;
        consolex.log("AutoPlay: Priority escalation - targeting HUMANS");
      }
      return { target: humans.sort((a, b) => a.troops() - b.troops())[0], priority: 3 };
    }
    
    // No targets available at any priority
    return { target: null, priority: this.currentTargetPriority };
  }
  
  private getTargetsByPriority(enemies: Player[], priority: number): Player[] {
    switch (priority) {
      case 1: // Bots
        return enemies.filter(e => e.type() === PlayerType.Bot);
      case 2: // Nations/FakeHumans
        return enemies.filter(e => e.type() === PlayerType.FakeHuman);
      case 3: // Real Players
        return enemies.filter(e => e.type() === PlayerType.Human);
      default:
        return [];
    }
  }
  
  private getPriorityForPlayer(player: Player): number {
    switch (player.type()) {
      case PlayerType.Bot:
        return 1;
      case PlayerType.FakeHuman:
        return 2;
      case PlayerType.Human:
        return 3;
      default:
        return 4; // Unknown/fallback
    }
  }
  
  private getPriorityName(priority: number): string {
    switch (priority) {
      case 1: return "BOT";
      case 2: return "NATION";
      case 3: return "HUMAN";
      default: return "UNKNOWN";
    }
  }
  
  private maybeAttack() {
    if (this.player === null || this.behavior === null) {
      throw new Error("not initialized");
    }

    if (!this.autoAttack) return; // Check if auto attacking is enabled

    const currentTick = this.mg.ticks();
    
    // Check attack cooldown to prevent rapid-fire attacks
    if (currentTick - this.lastAttackTime < this.attackCooldown) {
      return;
    }
    
    const enemyborder = Array.from(this.player.borderTiles())
      .flatMap((t) => this.mg.neighbors(t))
      .filter(
        (t) =>
          this.mg.isLand(t) && this.mg.ownerID(t) !== this.player?.smallID(),
      );
    
    // No land borders - launch naval invasions
    if (enemyborder.length === 0) {
      this.maybeNavalInvasion();
      return;
    }
    
    const enemiesWithTN = enemyborder.map((t) =>
      this.mg.playerBySmallID(this.mg.ownerID(t)),
    );
    
    // Always attack Terra Nullius first
    if (enemiesWithTN.filter((o) => !o.isPlayer()).length > 0) {
      this.behavior.sendAttack(this.mg.terraNullius(), false);
      this.lastAttackTime = currentTick; // Update attack time for cooldown
      return;
    }
    
    const enemies = enemiesWithTN
      .filter((o) => o.isPlayer())
      .sort((a, b) => a.troops() - b.troops());
    
    if (enemies.length === 0) return;
    
    // Early game alliance requests (first 3 minutes)
    if (currentTick < 1800 && this.random.chance(30)) {
      // Prefer allying with nations over humans in early game
      const nations = enemies.filter(e => e.type() === PlayerType.FakeHuman);
      if (nations.length > 0) {
        const toAlly = this.random.randElement(nations);
        if (this.player.canSendAllianceRequest(toAlly)) {
          this.player.createAllianceRequest(toAlly);
          consolex.log("AutoPlay: Requesting alliance with nation");
          return;
        }
      }
    }
    
    // PROGRESSIVE TARGET PRIORITY SYSTEM
    // Check if we need to select a new target
    const currentTargetPriority = this.committedTarget ? this.getPriorityForPlayer(this.committedTarget) : 0;
    const priorityBasedCooldownMultiplier = currentTargetPriority === 1 ? 1.5 : 1; // 50% longer commitment to bots
    
    const shouldSwitchTarget = this.committedTarget === null || 
        !this.committedTarget.isAlive() || 
        !enemies.includes(this.committedTarget) ||
        (currentTick - this.targetCommittedAt > this.targetSwitchCooldown * priorityBasedCooldownMultiplier) ||
        (this.committedTarget.troops() > this.player.troops() * (currentTargetPriority === 1 ? 4 : 3)); // More tolerance for bots
    
    if (shouldSwitchTarget) {
      // Use progressive priority system to select new target
      const targetSelection = this.selectTargetByPriority(enemies);
      
      if (targetSelection.target !== null) {
        this.committedTarget = targetSelection.target;
        this.targetCommittedAt = currentTick;
        
        const priorityName = this.getPriorityName(targetSelection.priority);
        consolex.log(`AutoPlay: Committing to attack ${priorityName} target (Priority ${targetSelection.priority})`);
      } else {
        // No valid targets available
        this.committedTarget = null;
        consolex.log("AutoPlay: No valid targets available at any priority level");
      }
    }
    
    // Attack our committed target if we should
    if (this.committedTarget !== null && this.shouldAttack(this.committedTarget)) {
      const targetPriority = this.getPriorityForPlayer(this.committedTarget);
      const isHighPriorityTarget = targetPriority <= 2; // Bots and Nations get enhanced allocation
      this.behavior.sendAttack(this.committedTarget, isHighPriorityTarget);
      this.lastAttackTime = currentTick; // Update attack time for cooldown
      
      const priorityName = this.getPriorityName(targetPriority);
      const bonusText = isHighPriorityTarget ? ' (+20%)' : '';
      consolex.log(`AutoPlay: Focused attack on ${priorityName} target${bonusText}`);
    }
  }
  
  private shouldAttack(other: Player): boolean {
    if (this.player === null) throw new Error("not initialized");
    if (this.player.isOnSameTeam(other)) {
      return false;
    }
    if (this.player.isFriendly(other)) {
      return false; // AutoPlay never betrays allies - remove betrayal mechanics
    }
    return true;
  }
  
  private handleUnits() {
    const player = this.player;
    if (player === null) return;

    if (!this.autoBuild) return; // Check if auto building is enabled

    const currentTime = this.mg.ticks();
    const cities = player.units(UnitType.City);

    // PHASE 1: Build 10 cities first (no port dependency to avoid gold hoarding)
    if (cities.length < 10 && player.gold() >= 125_000) {
      this.maybeSpawnStructure(UnitType.City, 10); // Allow up to 10 cities
      return;
    }

    // PHASE 2: Start rotating build system after 10 cities
    if (cities.length >= 10) {
      this.executeRotatingBuildStrategy();
    }
  }
  
  private executeRotatingBuildStrategy() {
    if (this.player === null) return;
    
    const currentTime = this.mg.ticks();
    
    // Cooldown between build attempts for balance
    if (currentTime - this.lastBuildAttempt < this.buildCooldown) {
      return;
    }
    
    const cities = this.player.units(UnitType.City);
    const ports = this.player.units(UnitType.Port);
    const vipers = this.player.units(UnitType.Viper);
    const condors = this.player.units(UnitType.Condor);
    const orbitals = this.player.units(UnitType.OrbitalCannon);
    const sams = this.player.units(UnitType.SAMLauncher);
    const silos = this.player.units(UnitType.MissileSilo);
    
    // Build rotation cycle: City -> Port -> Viper -> Condor -> Orbital -> (repeat)
    const rotationOptions = [
      { type: 'city', condition: () => this.player!.gold() > 400_000 },
      { type: 'port', condition: () => this.hasOceanAccess() && this.player!.gold() > 400_000 },
      { type: 'viper', condition: () => this.autoShip && ports.length > vipers.length && this.player!.gold() > 300_000 },
      { type: 'condor', condition: () => this.autoShip && ports.length >= 2 && condors.length < Math.floor(ports.length / 2) && this.player!.gold() > 800_000 },
      { type: 'orbital', condition: () => ports.length >= 3 && orbitals.length < Math.floor(ports.length / 3) && this.player!.gold() > 1_200_000 },
      { type: 'sam', condition: () => cities.length >= 5 && sams.length < Math.floor(cities.length / 5) && currentTime > 6000 },
      { type: 'silo', condition: () => cities.length >= 10 && silos.length < Math.floor(cities.length / 10) && currentTime > 9000 }
    ];
    
    // Try up to full rotation cycle to find something to build
    for (let attempts = 0; attempts < rotationOptions.length; attempts++) {
      const currentOption = rotationOptions[this.buildRotationIndex % rotationOptions.length];
      
      if (currentOption.condition()) {
        const built = this.tryBuildType(currentOption.type);
        if (built) {
          this.lastBuildAttempt = currentTime;
          this.buildRotationIndex = (this.buildRotationIndex + 1) % rotationOptions.length;
          return;
        }
      }
      
      // Move to next in rotation if current option can't be built
      this.buildRotationIndex = (this.buildRotationIndex + 1) % rotationOptions.length;
    }
  }
  
  private tryBuildType(buildType: string): boolean {
    if (this.player === null) return false;
    
    switch (buildType) {
      case 'city':
        return this.buildCity();
      case 'port':
        return this.buildPort();
      case 'viper':
        return this.buildViper();
      case 'condor':
        return this.buildCondor();
      case 'orbital':
        return this.buildOrbitalCannon();
      case 'sam':
        return this.buildSAMLauncher();
      case 'silo':
        return this.buildMissileSilo();
      default:
        return false;
    }
  }
  
  private buildCity(): boolean {
    const tile = this.randTerritoryTile();
    if (tile === null) return false;
    
    if (this.player!.canBuild(UnitType.City, tile) !== false) {
      this.mg.addExecution(
        new ConstructionExecution(this.player!.id(), tile, UnitType.City),
      );
      consolex.log("AutoPlay: Rotation - Building City");
      return true;
    }
    return false;
  }
  
  private buildPort(): boolean {
    const oceanTiles = Array.from(this.player!.borderTiles()).filter((t) =>
      this.mg.isOceanShore(t),
    );
    if (oceanTiles.length === 0) return false;
    
    const buildTile = this.random.randElement(oceanTiles);
    if (this.player!.canBuild(UnitType.Port, buildTile) !== false) {
      this.mg.addExecution(
        new ConstructionExecution(this.player!.id(), buildTile, UnitType.Port),
      );
      consolex.log("AutoPlay: Rotation - Building Port");
      return true;
    }
    return false;
  }
  
  private buildViper(): boolean {
    if (!this.autoShip) return false; // Check if auto ship is enabled

    const ports = this.player!.units(UnitType.Port);
    if (ports.length === 0) return false;

    const port = this.random.randElement(ports);
    const targetTile = this.warshipSpawnTile(port.tile());
    if (targetTile !== null && this.player!.canBuild(UnitType.Viper, targetTile) !== false) {
      this.mg.addExecution(
        new ConstructionExecution(this.player!.id(), targetTile, UnitType.Viper),
      );
      consolex.log("AutoPlay: Rotation - Building Viper");
      return true;
    }
    return false;
  }
  
  private buildCondor(): boolean {
    if (!this.autoShip) return false; // Check if auto ship is enabled

    const ports = this.player!.units(UnitType.Port);
    if (ports.length === 0) return false;

    const port = this.random.randElement(ports);
    const targetTile = this.warshipSpawnTile(port.tile());
    if (targetTile !== null && this.player!.canBuild(UnitType.Condor, targetTile) !== false) {
      this.mg.addExecution(
        new ConstructionExecution(this.player!.id(), targetTile, UnitType.Condor),
      );
      consolex.log("AutoPlay: Rotation - Building Condor");
      return true;
    }
    return false;
  }
  
  private buildOrbitalCannon(): boolean {
    const tile = this.randTerritoryTile();
    if (tile === null) return false;
    
    if (this.player!.canBuild(UnitType.OrbitalCannon, tile) !== false) {
      this.mg.addExecution(
        new ConstructionExecution(this.player!.id(), tile, UnitType.OrbitalCannon),
      );
      consolex.log("AutoPlay: Rotation - Building Orbital Cannon");
      return true;
    }
    return false;
  }
  
  private buildSAMLauncher(): boolean {
    const tile = this.randTerritoryTile();
    if (tile === null) return false;
    
    if (this.player!.canBuild(UnitType.SAMLauncher, tile) !== false) {
      this.mg.addExecution(
        new ConstructionExecution(this.player!.id(), tile, UnitType.SAMLauncher),
      );
      consolex.log("AutoPlay: Rotation - Building SAM Launcher");
      return true;
    }
    return false;
  }
  
  private buildMissileSilo(): boolean {
    const tile = this.randTerritoryTile();
    if (tile === null) return false;
    
    if (this.player!.canBuild(UnitType.MissileSilo, tile) !== false) {
      this.mg.addExecution(
        new ConstructionExecution(this.player!.id(), tile, UnitType.MissileSilo),
      );
      consolex.log("AutoPlay: Rotation - Building Missile Silo");
      return true;
    }
    return false;
  }
  
  private hasOceanAccess(): boolean {
    if (this.player === null) return false;
    return Array.from(this.player.borderTiles()).some((t) =>
      this.mg.isOceanShore(t),
    );
  }

  private maybeSpawnStructure(type: UnitType, maxNum: number) {
    if (this.player === null) throw new Error("not initialized");
    const units = this.player.units(type);
    if (units.length >= maxNum) {
      return;
    }
    
    const cost = this.mg.unitInfo(type).cost(this.player);
    if (this.player.gold() < cost) {
      return;
    }
    
    const tile = this.randTerritoryTile();
    if (tile === null) {
      return;
    }
    
    if (this.player.canBuild(type, tile) !== false) {
      this.mg.addExecution(
        new ConstructionExecution(this.player.id(), tile, type),
      );
      consolex.log(`AutoPlay: Building ${type.toString()}`);
    }
  }
  
  
  private maybeNavalInvasion() {
    if (this.player === null) throw new Error("not initialized");
    if (!this.autoShip) return; // Check if auto ship is enabled

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
    
    // Deploy Viper patrol near target landmass
    if (vipers.length > 0) {
      this.deployViperPatrol(targetLandmass.shoreTile);
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
    consolex.log(`AutoPlay: Launching systematic invasion of closest landmass (distance: ${targetLandmass.distance})`);
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
  
  private deployViperPatrol(targetShoreTile: TileRef) {
    if (this.player === null) return;
    
    const vipers = this.player.units(UnitType.Viper);
    if (vipers.length === 0) return;
    
    // Select a Viper that's not already on patrol
    const availableViper = vipers.find(viper => !viper.isInCooldown());
    if (!availableViper) return;
    
    // Position Viper near target landmass for patrol/reconnaissance
    const patrolX = this.mg.x(targetShoreTile) + this.random.nextInt(-200, 200);
    const patrolY = this.mg.y(targetShoreTile) + this.random.nextInt(-200, 200);
    
    if (this.mg.isValidCoord(patrolX, patrolY)) {
      const patrolTile = this.mg.ref(patrolX, patrolY);
      if (this.mg.isOcean(patrolTile)) {
        availableViper.move(patrolTile);
        consolex.log("AutoPlay: Deployed Viper patrol near target landmass");
      }
    }
  }
  
  private randOceanShoreTile(tile: TileRef, dist: number): TileRef | null {
    if (this.player === null) throw new Error("not initialized");
    const x = this.mg.x(tile);
    const y = this.mg.y(tile);
    
    for (let i = 0; i < 200; i++) {
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
        continue; // Skip unowned tiles for strategic targeting
      }
      if (!owner.isFriendly(this.player)) {
        return randTile;
      }
    }
    return null;
  }

  private warshipSpawnTile(portTile: TileRef): TileRef | null {
    const radius = 100;
    for (let attempts = 0; attempts < 30; attempts++) {
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
      if (this.mg.isOcean(tile)) {
        return tile;
      }
    }
    return null;
  }

  private randTerritoryTile(): TileRef | null {
    if (this.player === null) return null;
    const tiles = Array.from(this.player.tiles());
    if (tiles.length === 0) return null;
    return this.random.randElement(tiles);
  }
}