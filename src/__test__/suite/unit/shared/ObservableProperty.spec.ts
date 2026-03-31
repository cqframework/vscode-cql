import { expect } from 'chai';
import { ObservableProperty } from '../../../../shared/ObservableProperty';

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe('ObservableProperty testing', () => {
  it('should raise event on property change with correct updated value', done => {
    const property = new ObservableProperty<boolean>(true);

    // setup additional error handler
    property.on('error', message => {
      done(`error handler triggered unexpectedly. message=${message}`);
    });

    // setup change event handler
    property.on('change', value => {
      try {
        expect(value).to.equal(false);
        done();
      } catch (error) {
        done(error);
      }
    });

    // change value, which should trigger event
    property.value = false;
  });

  it('should not raise change event since property value was not changed', async () => {
    const property = new ObservableProperty<boolean>(true);
    let changeEventTriggered = false;

    // setup additional error handler
    property.on('error', message => {
      throw new Error(`error handler triggered unexpectedly. message=${message}`);
    });

    // setup change event handler
    property.on('change', value => {
      changeEventTriggered = true;
    });

    // change value, which should not trigger event
    property.value = true;

    // give time for the event to propagate, if triggered
    await sleep(50);
    if (changeEventTriggered) {
      throw new Error('change handler triggered unexpectedly');
    }
  });
});
