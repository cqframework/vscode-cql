import { RobustEmitter } from './RobustEmitter';

/**
 * Property class that supports change events.
 *
 * Usage:
 *  const statusProperty = new ObservableProperty<string>('idle');
 *  // Subscribe to the 'change' event
 *  statusProperty.on('change', (newVal: string, oldVal: string) => {
 *    console.log(`Status changed from ${oldVal} to ${newVal}`);
 *  });
 */
export class ObservableProperty<T> extends RobustEmitter {
  private _value: T;

  constructor(initialValue: T) {
    super();
    this._value = initialValue;
  }

  public get value(): T {
    return this._value;
  }

  public set value(newValue: T) {
    const oldValue = this._value;
    if (newValue !== oldValue) {
      this._value = newValue;
      this.emit('change', newValue, oldValue);
    }
  }
}
