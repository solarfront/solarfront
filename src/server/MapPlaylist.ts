import { getServerConfigFromServer } from "../core/configuration/ConfigLoader";
import { Difficulty, GameMapType, GameMode, GameType } from "../core/game/Game";
import { GameConfig } from "../core/Schemas";
import { logger } from "./Logger";

const log = logger.child({});

const config = getServerConfigFromServer();

// Include both Space2 and FacingWorlds in the frequency list
const frequency = {
  Space2: 1,
  FacingWorlds: 1,
};

interface MapWithMode {
  map: GameMapType;
  mode: GameMode;
}

export class MapPlaylist {
  private mapsPlaylist: MapWithMode[] = [];

  public gameConfig(): GameConfig {
    const { map, mode } = this.getNextMap();

    // Create the default public game config (from your GameManager)
    return {
      gameMap: map,
      maxPlayers: config.lobbyMaxPlayers(map, mode),
      gameType: GameType.Public,
      difficulty: Difficulty.Medium,
      infiniteGold: false,
      infiniteTroops: false,
      instantBuild: false,
      disableNPCs: false,
      disableNukes: false,
      gameMode: mode, // Will always be FFA based on our getNextMap implementation
      playerTeams: undefined, // No teams for FFA
      bots: 400,
    } as GameConfig;
  }

  private getNextMap(): MapWithMode {
    if (this.mapsPlaylist.length === 0) {
      this.shuffleMapsPlaylist();
      log.info(`Generated map playlist with Space2 and FacingWorlds FFA`);
    }

    // Even if it failed, playlist will be populated with Space2 FFA
    return (
      this.mapsPlaylist.shift() || {
        map: GameMapType.Space2,
        mode: GameMode.FFA,
      }
    );
  }

  private shuffleMapsPlaylist(): boolean {
    // Only use Space2 and FacingWorlds maps
    const maps: GameMapType[] = [GameMapType.Space2, GameMapType.FacingWorlds];

    this.mapsPlaylist = [];

    // Add both maps with FFA mode, alternating between them
    this.mapsPlaylist.push({ map: GameMapType.Space2, mode: GameMode.FFA });
    this.mapsPlaylist.push({
      map: GameMapType.FacingWorlds,
      mode: GameMode.FFA,
    });
    this.mapsPlaylist.push({ map: GameMapType.Space2, mode: GameMode.FFA });
    this.mapsPlaylist.push({
      map: GameMapType.FacingWorlds,
      mode: GameMode.FFA,
    });

    return this.mapsPlaylist.length > 0;
  }

  private addNextMap(
    playlist: MapWithMode[],
    nextEls: GameMapType[],
    mode: GameMode,
  ): boolean {
    // Only add Space2 with FFA mode
    if (mode !== GameMode.FFA) {
      return false;
    }

    const next = GameMapType.Space2;
    playlist.push({ map: next, mode: GameMode.FFA });
    return true;
  }
}
