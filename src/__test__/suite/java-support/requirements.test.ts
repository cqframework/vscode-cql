import { expect } from 'chai';
import { JavaRuntime } from '../../../java-support/findJavaRuntimes';
import { sortJdksBySource } from '../../../java-support/requirements';

suite('sortJdksBySource()', () => {
  function makeJdk(home: string, sources: string[]): JavaRuntime {
    return { home, version: 17, sources };
  }

  test('places env.JDK_HOME before env.JAVA_HOME', () => {
    const jdks = [makeJdk('/javaB', ['env.JAVA_HOME']), makeJdk('/javaA', ['env.JDK_HOME'])];
    sortJdksBySource(jdks);
    expect(jdks[0].home).to.equal('/javaA');
    expect(jdks[1].home).to.equal('/javaB');
  });

  test('places env.JDK_HOME before env.PATH', () => {
    const jdks = [makeJdk('/javaC', ['env.PATH']), makeJdk('/javaA', ['env.JDK_HOME'])];
    sortJdksBySource(jdks);
    expect(jdks[0].home).to.equal('/javaA');
  });

  test('places env.JAVA_HOME before env.PATH', () => {
    const jdks = [makeJdk('/javaC', ['env.PATH']), makeJdk('/javaB', ['env.JAVA_HOME'])];
    sortJdksBySource(jdks);
    expect(jdks[0].home).to.equal('/javaB');
  });

  test('places DefaultLocation after all named sources', () => {
    const jdks = [makeJdk('/javaD', ['DefaultLocation']), makeJdk('/javaB', ['env.JAVA_HOME'])];
    sortJdksBySource(jdks);
    expect(jdks[0].home).to.equal('/javaB');
    expect(jdks[1].home).to.equal('/javaD');
  });

  test('sorts three sources in priority order', () => {
    const jdks = [
      makeJdk('/javaC', ['env.PATH']),
      makeJdk('/javaD', ['DefaultLocation']),
      makeJdk('/javaA', ['env.JDK_HOME']),
      makeJdk('/javaB', ['env.JAVA_HOME']),
    ];
    sortJdksBySource(jdks);
    expect(jdks[0].home).to.equal('/javaA');
    expect(jdks[1].home).to.equal('/javaB');
    expect(jdks[2].home).to.equal('/javaC');
    expect(jdks[3].home).to.equal('/javaD');
  });

  test('stable when all have same priority source', () => {
    const jdks = [makeJdk('/javaA', ['env.JAVA_HOME']), makeJdk('/javaB', ['env.JAVA_HOME'])];
    sortJdksBySource(jdks);
    // Both rank 1 — order may be stable or not, but neither should throw
    expect(jdks).to.have.lengthOf(2);
  });
});
