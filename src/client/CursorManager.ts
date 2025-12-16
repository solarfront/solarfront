/**
 * CursorManager - Handles simple cursor states and click animations for SolarFront
 * Provides hover and click cursor states with smooth transitions
 */

export enum CursorState {
  HOVER = 'hover',
  CLICK = 'click'
}

export class CursorManager {
  private static instance: CursorManager;
  private clickTimeout: number | null = null;
  private currentState: CursorState = CursorState.HOVER;
  private isInitialized: boolean = false;

  constructor() {
    if (CursorManager.instance) {
      return CursorManager.instance;
    }
    CursorManager.instance = this;
  }

  /**
   * Initialize the cursor manager with click animations and event listeners
   */
  public initialize(): void {
    if (this.isInitialized) {
      console.warn('CursorManager already initialized');
      return;
    }

    this.setupClickAnimations();
    this.setupGameStateListeners();
    this.setupHotkeyBarIntegration();
    this.isInitialized = true;
    
    console.log('CursorManager initialized with simple cursor system');
  }

  /**
   * Set up click animation listeners for visual feedback
   */
  private setupClickAnimations(): void {
    // Global mousedown listener - change to click cursor
    document.addEventListener('mousedown', (e) => {
      this.setClickMode(document.body);
    });

    // Global mouseup listener - reset to hover cursor
    document.addEventListener('mouseup', (e) => {
      this.resetCursor(document.body);
    });
  }

  /**
   * Set up listeners for game state changes to update cursor contextually
   */
  private setupGameStateListeners(): void {
    // Simple cursor system - just listen for click animations
    // All other states are handled via CSS
  }

  /**
   * Set up integration with hotkey bar for drag and drop cursors
   */
  private setupHotkeyBarIntegration(): void {
    // Handle hotkey bar drag operations
    document.addEventListener('dragstart', (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('hotkey-button')) {
        // Build mode simplified - just use default hover cursor
      }
    });

    document.addEventListener('dragend', (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('hotkey-button')) {
        this.resetCursor(document.body);
      }
    });
  }

  /**
   * Trigger click animation on an element
   */
  private triggerClickAnimation(element: HTMLElement, event: MouseEvent): void {
    // Don't animate on disabled elements
    if (element.classList.contains('disabled') || 
        element.hasAttribute('disabled') ||
        element.getAttribute('aria-disabled') === 'true') {
      return;
    }

    // Add click animation class
    element.classList.add('cursor-click');

    // Clear existing timeout
    if (this.clickTimeout) {
      clearTimeout(this.clickTimeout);
    }

    // Remove animation class after a short delay
    this.clickTimeout = window.setTimeout(() => {
      element.classList.remove('cursor-click');
    }, 150);

    // Create visual ripple effect at click position for enhanced feedback
    this.createClickRipple(event.clientX, event.clientY);
  }

  /**
   * Create a ripple effect at the click position
   */
  private createClickRipple(x: number, y: number): void {
    const ripple = document.createElement('div');
    ripple.style.position = 'fixed';
    ripple.style.left = (x - 10) + 'px';
    ripple.style.top = (y - 10) + 'px';
    ripple.style.width = '20px';
    ripple.style.height = '20px';
    ripple.style.borderRadius = '50%';
    ripple.style.background = 'radial-gradient(circle, rgba(59,130,246,0.6) 0%, rgba(59,130,246,0) 70%)';
    ripple.style.pointerEvents = 'none';
    ripple.style.zIndex = '9999';
    ripple.style.animation = 'ripple-expand 0.3s ease-out forwards';

    // Add ripple keyframes if not already present
    if (!document.querySelector('#ripple-keyframes')) {
      const style = document.createElement('style');
      style.id = 'ripple-keyframes';
      style.textContent = `
        @keyframes ripple-expand {
          0% { transform: scale(0); opacity: 1; }
          100% { transform: scale(3); opacity: 0; }
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(ripple);

    // Remove ripple after animation
    setTimeout(() => {
      if (ripple.parentNode) {
        ripple.parentNode.removeChild(ripple);
      }
    }, 300);
  }


  /**
   * Set click cursor state
   */
  public setClickMode(element: HTMLElement): void {
    element.classList.add('cursor-click');
    this.currentState = CursorState.CLICK;
  }

  /**
   * Reset cursor to default hover state
   */
  public resetCursor(element: HTMLElement): void {
    element.classList.remove('cursor-click');
    this.currentState = CursorState.HOVER;
  }

  /**
   * Get current cursor state
   */
  public getCurrentState(): CursorState {
    return this.currentState;
  }

  /**
   * Apply context-specific cursor based on game element
   */
  public applyCursorContext(element: HTMLElement, context: string): void {
    switch (context) {
      case 'click':
        this.setClickMode(element);
        break;
      default:
        this.resetCursor(element);
    }
  }


  /**
   * Get singleton instance
   */
  public static getInstance(): CursorManager {
    if (!CursorManager.instance) {
      CursorManager.instance = new CursorManager();
    }
    return CursorManager.instance;
  }

  /**
   * Clean up event listeners (useful for testing or cleanup)
   */
  public cleanup(): void {
    if (this.clickTimeout) {
      clearTimeout(this.clickTimeout);
    }
    this.isInitialized = false;
  }
}