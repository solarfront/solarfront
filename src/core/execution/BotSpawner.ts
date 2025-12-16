import { consolex } from "../Consolex";
import { Game, PlayerInfo, PlayerType } from "../game/Game";
import { TileRef } from "../game/GameMap";
import { PseudoRandom } from "../PseudoRandom";
import { GameID } from "../Schemas";
import { simpleHash } from "../Util";
import { SpawnExecution } from "./SpawnExecution";
import { BOT_NAME_PREFIXES, BOT_NAME_SUFFIXES } from "./utils/BotNames";

export class BotSpawner {
  private random: PseudoRandom;
  private bots: SpawnExecution[] = [];

  constructor(
    private gs: Game,
    gameID: GameID,
  ) {
    this.random = new PseudoRandom(simpleHash(gameID));
  }

  spawnBots(numBots: number): SpawnExecution[] {
    let tries = 0;
    let currentMinDistance = 15; // Start with 15 tiles instead of 30
    console.log(`[BotSpawner] Attempting to spawn ${numBots} bots with initial min distance: ${currentMinDistance}`);
    
    while (this.bots.length < numBots) {
      if (tries > 10000) {
        console.log(`[BotSpawner] Too many retries (${tries}), giving up. Successfully spawned: ${this.bots.length}/${numBots}`);
        return this.bots;
      }
      
      // Progressive relaxation: reduce distance requirement every 2000 failed attempts
      if (tries > 0 && tries % 2000 === 0 && currentMinDistance > 8) {
        currentMinDistance -= 2;
        console.log(`[BotSpawner] Relaxing min distance to ${currentMinDistance} after ${tries} attempts. Spawned so far: ${this.bots.length}/${numBots}`);
      }
      
      const botName = this.randomBotName();
      const spawn = this.spawnBot(botName, currentMinDistance);
      if (spawn !== null) {
        this.bots.push(spawn);
        console.log(`[BotSpawner] Successfully spawned bot ${this.bots.length}/${numBots}: ${botName}`);
      } else {
        tries++;
      }
    }
    console.log(`[BotSpawner] Completed spawning ${this.bots.length} bots after ${tries} attempts`);
    return this.bots;
  }

  spawnBot(botName: string, minDistance: number = 15): SpawnExecution | null {
    const tile = this.randTile();
    if (!this.gs.isLand(tile)) {
      return null;
    }
    for (const spawn of this.bots) {
      if (this.gs.manhattanDist(spawn.tile, tile) < minDistance) {
        return null;
      }
    }
    return new SpawnExecution(
      new PlayerInfo("", botName, PlayerType.Bot, null, this.random.nextID()),
      tile,
    );
  }

  private randomBotName(): string {
    const prefixIndex = this.random.nextInt(0, BOT_NAME_PREFIXES.length);
    const suffixIndex = this.random.nextInt(0, BOT_NAME_SUFFIXES.length);
    return `${BOT_NAME_PREFIXES[prefixIndex]} ${BOT_NAME_SUFFIXES[suffixIndex]}`;
  }

  private randTile(): TileRef {
    return this.gs.ref(
      this.random.nextInt(0, this.gs.width()),
      this.random.nextInt(0, this.gs.height()),
    );
  }
}
