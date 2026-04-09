// All animation durations in ms — tune these constants to adjust feel
export const ANIM_SUMMON_DURATION = 300;
export const ANIM_MOVE_DURATION = 250;
export const ANIM_LUNGE_OUT_DURATION = 150;
export const ANIM_LUNGE_BACK_DURATION = 100;
export const ANIM_LUNGE_TOTAL_DURATION = 250; // out + back
export const ANIM_LUNGE_MIDPOINT = 150;       // ms into lunge when damage triggers on target
export const ANIM_DAMAGE_DURATION = 200;
export const ANIM_DEATH_DURATION = 400;
export const ANIM_HEAVY_DAMAGE_THRESHOLD = 5; // damage >= this triggers the heavy animation

class AnimationManager {
  _queue = [];
  _animating = false;
  _handlers = new Map();

  /**
   * Add an animation to the sequential queue.
   * Returns a Promise that resolves when this animation's handlers complete.
   * Registered handlers (via .on()) are called with the data payload.
   * The engine resolves game logic immediately; animations are purely visual.
   */
  queueAnimation(type, data) {
    return new Promise(resolve => {
      this._queue.push({ type, data, resolve });
      if (!this._animating) {
        this._playNext();
      }
    });
  }

  _playNext() {
    if (!this._queue.length) {
      this._animating = false;
      return;
    }
    this._animating = true;
    const { type, data, resolve } = this._queue.shift();
    const handlers = this._handlers.get(type) ?? [];
    Promise.all(handlers.map(h => h(data))).then(() => {
      resolve();
      this._playNext();
    });
  }

  /** Manually advance to the next queued animation (rarely needed externally). */
  playNext() {
    this._playNext();
  }

  /** True while any animation is playing or queued. */
  isAnimating() {
    return this._animating;
  }

  /**
   * Register a handler for a given animation type.
   * Handler receives the data payload and should return a Promise that resolves
   * when the animation visually completes.
   * Returns an unsubscribe function.
   */
  on(type, handler) {
    if (!this._handlers.has(type)) this._handlers.set(type, []);
    this._handlers.get(type).push(handler);
    return () => {
      const arr = this._handlers.get(type) ?? [];
      const i = arr.indexOf(handler);
      if (i >= 0) arr.splice(i, 1);
    };
  }
}

export const animationManager = new AnimationManager();
