import facingWorlds from "../../../resources/maps/FacingWorldsThumb.webp";
import space1 from "../../../resources/maps/Space1Thumb.webp";
import space2 from "../../../resources/maps/Space2Thumb.webp";
import testmap from "../../../resources/maps/TestMapThumb.webp";

import { GameMapType } from "../../core/game/Game";

export function getMapsImage(map: GameMapType): string {
  switch (map) {
    case GameMapType.Space1:
      return space1;
    case GameMapType.Space2:
      return space2;
    case GameMapType.FacingWorlds:
      return facingWorlds;
    case GameMapType.Testmap:
      return testmap;
    default:
      return "";
  }
}