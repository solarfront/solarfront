/**
 * CoordinateTransformer utility class for handling coordinate transformations
 * between different coordinate spaces in the game.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Rectangle {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export class CoordinateTransformer {
  constructor(
    private canvas: HTMLCanvasElement,
    private getScale: () => number,
    private getOffsetX: () => number,
    private getOffsetY: () => number,
    private gameWidth: () => number,
    private gameHeight: () => number
  ) {}

  /**
   * Convert browser viewport coordinates to canvas element coordinates
   */
  screenToCanvas(screenX: number, screenY: number): Point {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: screenX - rect.left,
      y: screenY - rect.top
    };
  }

  /**
   * Convert canvas coordinates to world/game coordinates
   * Applies camera transform and zoom
   */
  canvasToWorld(canvasX: number, canvasY: number): Point {
    const scale = this.getScale();
    const offsetX = this.getOffsetX();
    const offsetY = this.getOffsetY();
    const gameWidth = this.gameWidth();
    const gameHeight = this.gameHeight();

    // Calculate the world point
    const centerX = (canvasX - gameWidth / 2) / scale + offsetX;
    const centerY = (canvasY - gameHeight / 2) / scale + offsetY;

    const worldX = centerX + gameWidth / 2;
    const worldY = centerY + gameHeight / 2;

    return {
      x: Math.floor(worldX),
      y: Math.floor(worldY)
    };
  }

  /**
   * Convert world/game coordinates to canvas coordinates
   * Reverse of canvasToWorld
   */
  worldToCanvas(worldX: number, worldY: number): Point {
    const scale = this.getScale();
    const offsetX = this.getOffsetX();
    const offsetY = this.getOffsetY();
    const gameWidth = this.gameWidth();
    const gameHeight = this.gameHeight();

    const centerX = worldX - gameWidth / 2;
    const centerY = worldY - gameHeight / 2;

    const canvasX = (centerX - offsetX) * scale + gameWidth / 2;
    const canvasY = (centerY - offsetY) * scale + gameHeight / 2;

    return {
      x: canvasX,
      y: canvasY
    };
  }

  /**
   * Convert screen coordinates directly to world coordinates
   * Combines screenToCanvas and canvasToWorld
   */
  screenToWorld(screenX: number, screenY: number): Point {
    const canvas = this.screenToCanvas(screenX, screenY);
    return this.canvasToWorld(canvas.x, canvas.y);
  }

  /**
   * Convert world coordinates directly to screen coordinates
   * Combines worldToCanvas and canvasToScreen
   */
  worldToScreen(worldX: number, worldY: number): Point {
    const canvas = this.worldToCanvas(worldX, worldY);
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: canvas.x + rect.left,
      y: canvas.y + rect.top
    };
  }

  /**
   * Check if two rectangles intersect (AABB collision detection)
   */
  static rectIntersects(a: Rectangle, b: Rectangle): boolean {
    return !(a.right < b.left ||
             a.left > b.right ||
             a.bottom < b.top ||
             a.top > b.bottom);
  }

  /**
   * Create a rectangle from two points
   */
  static createRectangle(p1: Point, p2: Point): Rectangle {
    const left = Math.min(p1.x, p2.x);
    const top = Math.min(p1.y, p2.y);
    const right = Math.max(p1.x, p2.x);
    const bottom = Math.max(p1.y, p2.y);

    return {
      left,
      top,
      right,
      bottom,
      width: right - left,
      height: bottom - top
    };
  }

  /**
   * Check if a point is inside a rectangle
   */
  static pointInRectangle(point: Point, rect: Rectangle): boolean {
    return point.x >= rect.left &&
           point.x <= rect.right &&
           point.y >= rect.top &&
           point.y <= rect.bottom;
  }
}