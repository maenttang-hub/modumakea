import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isNonElectricalValidationComponent,
  isReportableValidationComponent,
} from '@/lib/validation-reportable-component-policy';

test('reportable component policy preserves physical parts with missing references by library id', () => {
  assert.equal(
    isReportableValidationComponent({
      importedReference: '',
      name: '',
      libraryId: 'UNO-TH_Rev3e-rescue:PINHD-2X3-UNO-TH_Rev3e-eagle-import',
      templateId: 'kicad_pinhd_2x3_uno_th_rev3e_eagle_import',
    }),
    true
  );

  assert.equal(
    isReportableValidationComponent({
      libraryId: 'UNO-TH_Rev3e-rescue:SJ-UNO-TH_Rev3e-eagle-import',
      templateId: 'kicad_sj_uno_th_rev3e_eagle_import',
    }),
    true
  );
});

test('reportable component policy excludes schematic helpers consistently', () => {
  assert.equal(
    isReportableValidationComponent({
      libraryId: 'Connector:TestPoint',
      templateId: 'kicad_testpoint',
    }),
    false
  );

  assert.equal(
    isReportableValidationComponent({
      reference: 'TP1',
      libraryId: 'Connector:TestPoint_Small',
      templateId: 'kicad_testpoint_small',
    }),
    false
  );

  assert.equal(
    isReportableValidationComponent({
      reference: 'TP2',
      libraryId: 'Connector:TestPoint_Alt',
      templateId: 'kicad_testpoint_alt',
    }),
    false
  );

  assert.equal(
    isReportableValidationComponent({
      libraryId: 'UNO-TH_Rev3e-rescue:TP_SP-UNO-TH_Rev3e-eagle-import',
      templateId: 'kicad_tp_sp_uno_th_rev3e_eagle_import',
    }),
    false
  );

  assert.equal(
    isReportableValidationComponent({
      reference: 'TP4300',
      libraryId: '*:root_1_mirrored_TP_*',
      templateId: 'kicad_root_1_mirrored_tp',
    }),
    false
  );

  assert.equal(
    isReportableValidationComponent({
      reference: 'TP8',
      libraryId: 'canhw:TestPointKeystone',
      templateId: 'kicad_testpointkeystone',
    }),
    false
  );

  assert.equal(
    isReportableValidationComponent({
      reference: '#PWR01',
      libraryId: 'power:+5V',
      templateId: 'kicad_5v',
    }),
    false
  );

  assert.equal(
    isReportableValidationComponent({
      libraryId: 'S2020-rescue:GND-00TJR',
      templateId: 'kicad_gnd_00tjr',
    }),
    false
  );

  assert.equal(
    isReportableValidationComponent({
      libraryId: 'S2020-rescue:+24V-power',
      templateId: 'kicad_24v_power',
    }),
    false
  );

  assert.equal(
    isReportableValidationComponent({
      reference: 'FID1',
      libraryId: 'Mechanical:Fiducial',
      templateId: 'kicad_fiducial',
    }),
    false
  );
});

test('non-electrical policy separates mechanical symbols from reportable electrical parts', () => {
  assert.equal(
    isNonElectricalValidationComponent({
      reference: 'H1',
      libraryId: 'Mechanical:MountingHole',
      templateId: 'kicad_mountinghole',
    }),
    true
  );

  assert.equal(
    isReportableValidationComponent({
      reference: 'H1',
      libraryId: 'Mechanical:MountingHole',
      templateId: 'kicad_mountinghole',
    }),
    false
  );

  assert.equal(
    isNonElectricalValidationComponent({
      reference: '#PWR01',
      libraryId: 'power:+5V',
      templateId: 'kicad_5v',
    }),
    false
  );

  assert.equal(
    isNonElectricalValidationComponent({
      reference: 'H2',
      libraryId: 'Mechanical:MountingHole_Pad',
      templateId: 'kicad_mountinghole_pad',
    }),
    false
  );

  assert.equal(
    isReportableValidationComponent({
      reference: 'H2',
      libraryId: 'Mechanical:MountingHole_Pad',
      templateId: 'kicad_mountinghole_pad',
    }),
    true
  );

  assert.equal(
    isNonElectricalValidationComponent({
      reference: 'C1',
      libraryId: 'Device:C',
      templateId: 'kicad_device_c',
    }),
    false
  );
});
