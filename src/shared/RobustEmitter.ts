import { EventEmitter } from 'node:events';

export class RobustEmitter extends EventEmitter {
  constructor() {
    super();
    // Prevent the "Uncaught 'error' event" crash
    this.on('error', err => {
      console.error(`[Global Error Handler]: ${err.stack}`);
    });
  }

  emit(event: string, ...args: any[]) {
    // 1. Get all listeners for this specific event
    const listeners = this.listeners(event);

    // 2. If it's an error event with no listeners, use our fail-safe
    if (event === 'error' && listeners.length === 0) {
      console.error(`Unhandled error event emitted: ${args[0]}`);
      return false;
    }

    // 3. Execute each listener inside a try-catch block
    listeners.forEach(handler => {
      try {
        handler.apply(this, args);
      } catch (error) {
        // Handle errors thrown *inside* a listener
        this.emit('error', new Error(`Listener for "${event}" failed: ${error}`));
      }
    });

    return listeners.length > 0;
  }
}
