import { expect } from 'chai';
import { Uri, workspace } from 'vscode';
import { getMeasureReportData, extractTestCaseDescription } from '../../../model/testCase';

suite('testCase.getMeasureReportData tests', () => {
  test('returns undefined when directory does not exist', () => {
    expect(getMeasureReportData(Uri.file('/does/not/exist/9999'))).to.be.undefined;
  });

  test('returns undefined when no MeasureReport file is present', () => {
    const folder = Uri.joinPath(
      workspace.workspaceFolders![0].uri,
      'input/tests/Measure/SimpleMeasure/2222',
    );
    expect(getMeasureReportData(folder)).to.be.undefined;
  });

  test('returns undefined populations when MeasureReport has no group field', () => {
    const folder = Uri.joinPath(
      workspace.workspaceFolders![0].uri,
      'input/tests/Measure/SimpleMeasure/1111',
    );
    const result = getMeasureReportData(folder);
    expect(result).to.not.be.undefined;
    expect(result!.populations).to.be.undefined;
  });

  test('extracts patientId from contained Parameters (MADIE format)', () => {
    const folder = Uri.joinPath(
      workspace.workspaceFolders![0].uri,
      'input/tests/Measure/SimpleMeasure/1111',
    );
    const result = getMeasureReportData(folder);
    expect(result!.patientId).to.equal('0c76341a-34f1-4d1b-9bbe-5915e00a0818');
  });

  test('returns populations with groupId for each group', () => {
    const folder = Uri.joinPath(
      workspace.workspaceFolders![0].uri,
      'input/tests/Measure/SimpleMeasure/3333',
    );
    const result = getMeasureReportData(folder);
    expect(result).to.not.be.undefined;
    expect(result!.patientId).to.equal('patient-3333');
    expect(result!.populations).to.have.length(4);
  });

  test('assigns correct groupId to populations from Group_1', () => {
    const folder = Uri.joinPath(
      workspace.workspaceFolders![0].uri,
      'input/tests/Measure/SimpleMeasure/3333',
    );
    const result = getMeasureReportData(folder);
    const group1Pops = result!.populations!.filter(p => p.groupId === 'Group_1');
    expect(group1Pops).to.have.length(2);
    expect(group1Pops.map(p => p.display)).to.deep.equal(['Initial Population', 'Numerator']);
    expect(group1Pops.map(p => p.expected)).to.deep.equal([1, 0]);
  });

  test('assigns correct groupId to populations from Group_2', () => {
    const folder = Uri.joinPath(
      workspace.workspaceFolders![0].uri,
      'input/tests/Measure/SimpleMeasure/3333',
    );
    const result = getMeasureReportData(folder);
    const group2Pops = result!.populations!.filter(p => p.groupId === 'Group_2');
    expect(group2Pops).to.have.length(2);
    expect(group2Pops.map(p => p.display)).to.deep.equal(['Initial Population', 'Denominator']);
    expect(group2Pops.map(p => p.expected)).to.deep.equal([1, 1]);
  });

  test('includes code field for each population', () => {
    const folder = Uri.joinPath(
      workspace.workspaceFolders![0].uri,
      'input/tests/Measure/SimpleMeasure/3333',
    );
    const result = getMeasureReportData(folder);
    const ipp = result!.populations!.find(
      p => p.groupId === 'Group_1' && p.display === 'Initial Population',
    );
    expect(ipp!.code).to.equal('initial-population');
  });

  test('extracts description from cqfm-testCaseDescription extension (1111 fixture)', () => {
    const folder = Uri.joinPath(
      workspace.workspaceFolders![0].uri,
      'input/tests/Measure/SimpleMeasure/1111',
    );
    const result = getMeasureReportData(folder);
    expect(result!.description).to.equal('SimpleMeasure');
  });

  test('description is undefined when no extension block present (3333 fixture)', () => {
    const folder = Uri.joinPath(
      workspace.workspaceFolders![0].uri,
      'input/tests/Measure/SimpleMeasure/3333',
    );
    const result = getMeasureReportData(folder);
    expect(result!.description).to.be.undefined;
  });

  test('extractTestCaseDescription strips markdown and collapses newlines', () => {
    const report = {
      extension: [
        {
          url: 'http://hl7.org/fhir/us/cqfmeasures/StructureDefinition/cqfm-testCaseDescription',
          valueMarkdown: '**Patient** has\none KCCQ _Domain_ assessment',
        },
      ],
    };
    const result = extractTestCaseDescription(report);
    expect(result).to.equal('Patient has one KCCQ Domain assessment');
  });

  test('extractTestCaseDescription strips wrapping double-quotes from valueMarkdown', () => {
    const report = {
      extension: [
        {
          url: 'http://hl7.org/fhir/us/cqfmeasures/StructureDefinition/cqfm-testCaseDescription',
          valueMarkdown: '"Diagnosis = Afib during encounter\n"',
        },
      ],
    };
    const result = extractTestCaseDescription(report);
    expect(result).to.equal('Diagnosis = Afib during encounter');
  });
});
