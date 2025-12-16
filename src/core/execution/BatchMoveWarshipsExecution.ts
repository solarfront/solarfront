import { Execution, Game } from "../game/Game";

export class BatchMoveWarshipsExecution implements Execution {
  private active = true;
  private mg: Game | null = null;

  constructor(
    public readonly movements: Array<{ unitId: number; targetTile: number }>,
  ) {}

  init(mg: Game, ticks: number): void {
    this.mg = mg;
  }

  tick(ticks: number): void {
    if (this.mg === null) {
      throw new Error("Not initialized");
    }

    console.log(`[SHIP DEBUG] BatchMoveWarshipsExecution tick: Processing ${this.movements.length} movements`);

    // Process each warship movement
    this.movements.forEach(movement => {
      const warship = this.mg!.units().find((u) => u.id() === movement.unitId);
      if (!warship) {
        console.log(`[SHIP DEBUG] BatchMoveWarshipsExecution: warship ${movement.unitId} is already dead or not found`);
        return;
      }

      console.log(`[SHIP DEBUG] BatchMoveWarshipsExecution: Setting targetTile ${movement.targetTile} for warship ${movement.unitId} at tile ${warship.tile()}`);
      // Set the target tile for the warship
      warship.setTargetTile(movement.targetTile);
    });

    console.log(`[SHIP DEBUG] BatchMoveWarshipsExecution: Complete, marking inactive`);
    // Mark execution as complete
    this.active = false;
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }
}