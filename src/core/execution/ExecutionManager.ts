import { Execution, Game, UnitType } from "../game/Game";
import { TileRef } from "../game/GameMap";
import { PlayerImpl } from "../game/PlayerImpl";
import { PseudoRandom } from "../PseudoRandom";
import { ClientID, GameID, Intent, Turn } from "../Schemas";
import { simpleHash } from "../Util";
import { AllChatExecution } from "./AllChatExecution";
import { AllianceRequestExecution } from "./alliance/AllianceRequestExecution";
import { AllianceRequestReplyExecution } from "./alliance/AllianceRequestReplyExecution";
import { BreakAllianceExecution } from "./alliance/BreakAllianceExecution";
import { AttackExecution } from "./AttackExecution";
import { AutoPlayExecution } from "./AutoPlayExecution";
import { BotExecution } from "./BotExecution";
import { BotSpawner } from "./BotSpawner";
import { ConstructionExecution } from "./ConstructionExecution";
import { DirectChatExecution } from "./DirectChatExecution";
import { DonateGoldExecution } from "./DonateGoldExecution";
import { DonateTroopsExecution } from "./DonateTroopExecution";
import { EmbargoExecution } from "./EmbargoExecution";
import { EmojiExecution } from "./EmojiExecution";
import { FakeHumanExecution } from "./FakeHumanExecution";
import { MoveWarshipExecution } from "./MoveWarshipExecution";
import { BatchMoveWarshipsExecution } from "./BatchMoveWarshipsExecution";
import { NoOpExecution } from "./NoOpExecution";
import { QuickChatExecution } from "./QuickChatExecution";
import { RetreatExecution } from "./RetreatExecution";
import { SetTargetTroopRatioExecution } from "./SetTargetTroopRatioExecution";
import { SpawnExecution } from "./SpawnExecution";
import { TargetPlayerExecution } from "./TargetPlayerExecution";
import { TransportShipExecution } from "./TransportShipExecution";
import { WhisperExecution } from "./WhisperExecution";

export class Executor {
  // private random = new PseudoRandom(999)
  private random: PseudoRandom;
  private autoPlayExecutions = new Map<string, AutoPlayExecution>();

  constructor(
    private mg: Game,
    private gameID: GameID,
    private clientID: ClientID,
  ) {
    // Add one to avoid id collisions with bots.
    this.random = new PseudoRandom(simpleHash(gameID) + 1);
  }

  createExecs(turn: Turn): Execution[] {
    return turn.intents.map((i) => this.createExec(i));
  }

  createExec(intent: Intent): Execution {
    const player = this.mg.playerByClientID(intent.clientID);
    if (!player) {
      console.warn(`player with clientID ${intent.clientID} not found`);
      if (intent.type === "spawn") {
        console.warn(
          `Spawn intent failed - available players:`,
          this.mg.players().map((p) => ({
            clientID: p.clientID(),
            name: p.name(),
            hasSpawned: p.hasSpawned(),
          })),
        );
      }
      return new NoOpExecution();
    }
    const playerID = player.id();

    switch (intent.type) {
      case "attack": {
        return new AttackExecution(
          intent.troops,
          playerID,
          intent.targetID,
          null,
        );
      }
      case "cancel_attack":
        return new RetreatExecution(playerID, intent.attackID);
      case "move_warship":
        return new MoveWarshipExecution(intent.unitId, intent.tile);
      case "batch_move_warships":
        return new BatchMoveWarshipsExecution(intent.movements);
      case "spawn":
        return new SpawnExecution(
          player.info(),
          this.mg.ref(intent.x, intent.y),
        );
      case "boat":
        let src: TileRef | null = null;
        if (intent.srcX !== null && intent.srcY !== null) {
          src = this.mg.ref(intent.srcX, intent.srcY);
        }
        return new TransportShipExecution(
          playerID,
          intent.targetID,
          this.mg.ref(intent.dstX, intent.dstY),
          intent.troops,
          src,
        );
      case "allianceRequest":
        return new AllianceRequestExecution(playerID, intent.recipient);
      case "allianceRequestReply":
        return new AllianceRequestReplyExecution(
          intent.requestor,
          playerID,
          intent.accept,
        );
      case "breakAlliance":
        return new BreakAllianceExecution(playerID, intent.recipient);
      case "targetPlayer":
        return new TargetPlayerExecution(playerID, intent.target);
      case "emoji":
        return new EmojiExecution(playerID, intent.recipient, intent.emoji);
      case "donate_troops":
        return new DonateTroopsExecution(
          playerID,
          intent.recipient,
          intent.troops,
        );
      case "donate_gold":
        return new DonateGoldExecution(playerID, intent.recipient, intent.gold);
      case "troop_ratio":
        return new SetTargetTroopRatioExecution(playerID, intent.ratio);
      case "embargo":
        return new EmbargoExecution(player, intent.targetID, intent.action);
      case "build_unit":
        // Cast to PlayerImpl to access rate limiting methods
        const playerImpl = player as PlayerImpl;

        // Rate limiting check for building construction to prevent mashing exploits
        // Only apply rate limiting to buildings, not warships or nukes
        const isBuildingType = intent.unit === UnitType.City ||
                              intent.unit === UnitType.Port ||
                              intent.unit === UnitType.DefensePost ||
                              intent.unit === UnitType.MissileSilo ||
                              intent.unit === UnitType.SAMLauncher ||
                              intent.unit === UnitType.OrbitalCannon;

        if (isBuildingType && !playerImpl.canConstructBuilding(intent.unit)) {
          // Too soon after last construction (either global cooldown or same-type cooldown)
          console.log(`Rate limiting: ${player.name()} tried to build ${intent.unit} too quickly (2 tick cooldown)`);
          return new NoOpExecution();
        }

        // Mark the construction time if it's a building
        if (isBuildingType) {
          playerImpl.setLastConstructionTime(intent.unit);
        }

        return new ConstructionExecution(
          playerID,
          this.mg.ref(intent.x, intent.y),
          intent.unit,
        );
      case "quick_chat":
        return new QuickChatExecution(
          playerID,
          intent.recipient,
          intent.quickChatKey,
          intent.variables ?? {},
        );
      case "direct_chat":
        return new DirectChatExecution(
          playerID,
          intent.recipient,
          intent.message,
        );
      case "all_chat":
        return new AllChatExecution(playerID, intent.message);
      case "whisper":
        return new WhisperExecution(
          intent.sender,
          intent.recipient,
          intent.message,
        );
      case "auto_play_toggle":
        return this.createAutoPlayToggle(playerID, intent.enabled, intent.autoBuild, intent.autoShip, intent.autoAttack, intent.attackRatio);
      case "auto_play_attack_ratio_update":
        return this.updateAutoPlayAttackRatio(playerID, intent.attackRatio);
      default:
        throw new Error(`intent type ${(intent as Intent).type} not found`);
    }
  }

  spawnBots(numBots: number): Execution[] {
    return new BotSpawner(this.mg, this.gameID).spawnBots(numBots);
  }

  // Nations use FakeHumanExecution for spawning and AI control
  fakeHumanExecutions(): Execution[] {
    const execs: Execution[] = [];
    for (const nation of this.mg.nations()) {
      execs.push(new FakeHumanExecution(this.gameID, nation));
    }
    return execs;
  }

  private createAutoPlayToggle(
    playerID: string,
    enabled: boolean,
    autoBuild: boolean,
    autoShip: boolean,
    autoAttack: boolean,
    attackRatio?: number
  ): Execution {
    if (enabled) {
      // Disable existing auto-play if it exists (to update features)
      const existingExec = this.autoPlayExecutions.get(playerID);
      if (existingExec) {
        existingExec['active'] = false;
        this.autoPlayExecutions.delete(playerID);
      }

      // Enable auto-play with the specified features
      // Skip initial delay for immediate auto-play responsiveness
      console.log(`AutoPlay DEBUG: ExecutionManager creating AutoPlayExecution with features - Build: ${autoBuild}, Ship: ${autoShip}, Attack: ${autoAttack}, attackRatio: ${attackRatio || 0.2}`);

      const autoPlayExec = new AutoPlayExecution(
        playerID,
        this.gameID,
        true,
        autoBuild,
        autoShip,
        autoAttack,
        () => attackRatio || 0.2 // Function that returns the current attack ratio
      );
      this.autoPlayExecutions.set(playerID, autoPlayExec);
      this.mg.addExecution(autoPlayExec);
    } else {
      // Disable auto-play for this player
      const autoPlayExec = this.autoPlayExecutions.get(playerID);
      if (autoPlayExec) {
        // Mark as inactive - the execution system will clean it up
        autoPlayExec['active'] = false;
        this.autoPlayExecutions.delete(playerID);
      }
    }

    return new NoOpExecution(); // No immediate action needed
  }

  private updateAutoPlayAttackRatio(playerID: string, attackRatio: number): Execution {
    const autoPlayExec = this.autoPlayExecutions.get(playerID);
    if (autoPlayExec) {
      autoPlayExec.updateAttackRatio(attackRatio);
      console.log(`AutoPlay DEBUG: Updated attack ratio for player ${playerID} to ${attackRatio}`);
    } else {
      console.log(`AutoPlay DEBUG: No auto play execution found for player ${playerID} to update attack ratio`);
    }
    
    return new NoOpExecution(); // No immediate action needed
  }
}
