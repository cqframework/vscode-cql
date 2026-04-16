import { expect } from 'chai';
import { mergeParameters, resolveParameters } from '../../../helpers/parametersHelper';
import { CqlParametersConfig, ParameterEntry } from '../../../model/parameters';

const p = (name: string, type: string, value: string): ParameterEntry => ({ name, type, value });

suite('mergeParameters()', () => {
  test('returns empty array when all inputs are empty', () => {
    expect(mergeParameters([], [], [])).to.deep.equal([]);
  });

  test('returns global entries when library and testCase are empty', () => {
    const global = [p('Measurement Period', 'Interval<DateTime>', 'Interval[@2024-01-01, @2024-12-31]')];
    expect(mergeParameters(global, [], [])).to.deep.equal(global);
  });

  test('library overrides global for same parameter name', () => {
    const global = [p('Product Line', 'String', 'HMO')];
    const library = [p('Product Line', 'String', 'PPO')];
    const result = mergeParameters(global, library, []);
    expect(result).to.have.length(1);
    expect(result[0].value).to.equal('PPO');
  });

  test('testCase overrides library for same parameter name', () => {
    const library = [p('Product Line', 'String', 'PPO')];
    const testCase = [p('Product Line', 'String', 'Medicaid')];
    const result = mergeParameters([], library, testCase);
    expect(result).to.have.length(1);
    expect(result[0].value).to.equal('Medicaid');
  });

  test('testCase overrides global for same parameter name', () => {
    const global = [p('Product Line', 'String', 'HMO')];
    const testCase = [p('Product Line', 'String', 'Medicaid')];
    const result = mergeParameters(global, [], testCase);
    expect(result).to.have.length(1);
    expect(result[0].value).to.equal('Medicaid');
  });

  test('distinct parameter names from all levels are all included', () => {
    const global = [p('Measurement Period', 'Interval<DateTime>', 'Interval[@2024-01-01, @2024-12-31]')];
    const library = [p('Product Line', 'String', 'HMO')];
    const testCase = [p('Custom Flag', 'Boolean', 'true')];
    const result = mergeParameters(global, library, testCase);
    expect(result).to.have.length(3);
    const names = result.map(r => r.name);
    expect(names).to.include('Measurement Period');
    expect(names).to.include('Product Line');
    expect(names).to.include('Custom Flag');
  });
});

suite('resolveParameters()', () => {
  const config: CqlParametersConfig = [
    // global: no library field
    p('Measurement Period', 'Interval<DateTime>', 'Interval[@2024-01-01, @2024-12-31]'),
    // library block for MyLib (unversioned)
    {
      library: 'MyLib',
      parameters: [p('Product Line', 'String', 'HMO')],
      testCases: {
        'patient-uuid-abc': [p('Product Line', 'String', 'Medicaid')],
      },
    },
  ];

  test('returns global params when library has no matching block', () => {
    const result = resolveParameters(config, 'OtherLib', undefined, undefined);
    expect(result).to.have.length(1);
    expect(result[0].name).to.equal('Measurement Period');
    expect(result[0].source).to.equal('config-global');
  });

  test('merges global + library params', () => {
    const result = resolveParameters(config, 'MyLib', undefined, undefined);
    expect(result).to.have.length(2);
    const map = Object.fromEntries(result.map(r => [r.name, r]));
    expect(map['Measurement Period'].value).to.equal('Interval[@2024-01-01, @2024-12-31]');
    expect(map['Measurement Period'].source).to.equal('config-global');
    expect(map['Product Line'].value).to.equal('HMO');
    expect(map['Product Line'].source).to.equal('config-library');
  });

  test('test case overrides library param', () => {
    const result = resolveParameters(config, 'MyLib', undefined, 'patient-uuid-abc');
    const productLine = result.find(r => r.name === 'Product Line');
    expect(productLine?.value).to.equal('Medicaid');
    expect(productLine?.source).to.equal('config-test-case');
  });

  test('unknown patientId falls back to global + library', () => {
    const result = resolveParameters(config, 'MyLib', undefined, 'unknown-patient');
    const productLine = result.find(r => r.name === 'Product Line');
    expect(productLine?.value).to.equal('HMO');
    expect(productLine?.source).to.equal('config-library');
  });

  test('returns empty array when config is empty', () => {
    expect(resolveParameters([], 'MyLib', undefined, 'some-patient')).to.deep.equal([]);
  });

  test('global param not overridden retains source config-global', () => {
    const result = resolveParameters(config, 'MyLib', undefined, 'patient-uuid-abc');
    const mp = result.find(r => r.name === 'Measurement Period');
    expect(mp?.source).to.equal('config-global');
  });

  suite('version matching', () => {
    const versionedConfig: CqlParametersConfig = [
      p('Global Param', 'String', 'global'),
      {
        library: 'MyLib',
        version: '1.0.000',
        parameters: [p('Versioned Param', 'String', 'v1')],
      },
      {
        library: 'MyLib',
        version: '2.0.000',
        parameters: [p('Versioned Param', 'String', 'v2')],
      },
      {
        library: 'MyLib',
        // no version — matches any version
        parameters: [p('Unversioned Param', 'String', 'any')],
      },
    ];

    test('versioned block applies only when version matches exactly', () => {
      const result = resolveParameters(versionedConfig, 'MyLib', '1.0.000', undefined);
      const named = Object.fromEntries(result.map(r => [r.name, r.value]));
      expect(named['Versioned Param']).to.equal('v1');
      expect(named['Unversioned Param']).to.equal('any');
      expect(named['Global Param']).to.equal('global');
    });

    test('versioned block for different version is excluded', () => {
      const result = resolveParameters(versionedConfig, 'MyLib', '1.0.000', undefined);
      expect(result.find(r => r.value === 'v2')).to.be.undefined;
    });

    test('unversioned block always applies regardless of library version', () => {
      const result = resolveParameters(versionedConfig, 'MyLib', '99.0.000', undefined);
      const names = result.map(r => r.name);
      expect(names).to.include('Unversioned Param');
      expect(names).not.to.include('Versioned Param');
    });

    test('undefined libraryVersion skips versioned blocks', () => {
      const result = resolveParameters(versionedConfig, 'MyLib', undefined, undefined);
      const names = result.map(r => r.name);
      expect(names).to.include('Unversioned Param');
      expect(names).not.to.include('Versioned Param');
    });
  });
});
