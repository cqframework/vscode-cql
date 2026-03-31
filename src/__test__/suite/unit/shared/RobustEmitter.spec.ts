import { expect } from 'chai';
import { RobustEmitter } from '../../../../shared/RobustEmitter';

describe('RobustEmitter emit testing', () => {
  let emitter: RobustEmitter;

  beforeEach(() => {
    emitter = new RobustEmitter();
  });

  it('should handle error with default error handler', done => {
    try {
      expect(emitter.emit('error', 'test error')).to.be.true;
      done();
    } catch (error) {
      done(error);
    }
  });

  it('should handle error with additional error handler', done => {
    const errorMessage = 'testing';

    // setup additional error handler
    emitter.on('error', error => {
      try {
        expect(error).to.equal(errorMessage);
        done();
      } catch (error) {
        done(error);
      }
    });

    // trigger error
    emitter.emit('error', errorMessage);
  });

  it('should handle non-error with default error handler', done => {
    const eventMessage = 'testing another event';

    // setup additional event handler
    emitter.on('anotherEvent', message => {
      try {
        expect(message).to.equal(eventMessage);
        done();
      } catch (error) {
        done(error);
      }
    });

    // trigger event
    emitter.emit('anotherEvent', eventMessage);
  });

  it('should handle non-error event, but not the additional error handler', done => {
    const eventMessage = 'testing another event';

    // setup additional error handler
    emitter.on('error', message => {
      done(`error handler triggered unexpectedly. message=${message}`);
    });

    // setup additional event handler
    emitter.on('anotherEvent', message => {
      try {
        expect(message).to.equal(eventMessage);
        done();
      } catch (error) {
        done(error);
      }
    });

    // trigger event
    emitter.emit('anotherEvent', eventMessage);
  });
});
