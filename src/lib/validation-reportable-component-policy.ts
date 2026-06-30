type ComponentLike = {
  reference?: string | null;
  importedReference?: string | null;
  name?: string | null;
  libId?: string | null;
  libraryId?: string | null;
  templateId?: string | null;
};

function normalize(value: string | null | undefined) {
  return value?.trim() ?? '';
}

function firstNormalized(values: Array<string | null | undefined>) {
  for (const value of values) {
    const normalized = normalize(value);
    if (normalized) {
      return normalized;
    }
  }
  return '';
}

export function getComponentReportReference(component: ComponentLike) {
  return firstNormalized([
    component.reference,
    component.importedReference,
    component.name,
    component.libId,
    component.libraryId,
    component.templateId,
  ]);
}

export function isKiCadPowerTemplateId(templateId: string | null | undefined) {
  const value = normalize(templateId).toLowerCase();
  return value.startsWith('kicad_gnd') || value.startsWith('kicad_pwr');
}

export function isKiCadPowerLibraryId(libraryId: string | null | undefined) {
  const value = normalize(libraryId).toLowerCase();
  if (value.startsWith('power:')) {
    return true;
  }
  const tail = value.includes(':') ? value.split(':').at(-1) ?? value : value;
  return tail === 'gnd' || tail.startsWith('gnd-') || /^\+?\d+(?:v|v\d|v\d\d|v\d\d\d)/.test(tail);
}

export function isNonElectricalLibraryId(libraryId: string | null | undefined) {
  const value = normalize(libraryId).toLowerCase();
  return value.includes('logo') || value === 'mechanical:mountinghole' || value === 'mechanical:fiducial';
}

export function isNonElectricalTemplateId(templateId: string | null | undefined) {
  const value = normalize(templateId).toLowerCase();
  return (
    value === 'kicad_mountinghole' ||
    value === 'mountinghole' ||
    value.includes('logo') ||
    value.endsWith('fiducial') ||
    value === 'kicad_fiducial'
  );
}

export function isNonElectricalValidationComponent(component: ComponentLike) {
  const libraryId = component.libId ?? component.libraryId;
  return isNonElectricalLibraryId(libraryId) || isNonElectricalTemplateId(component.templateId);
}

export function isValidationHelperTemplateId(templateId: string | null | undefined) {
  const value = normalize(templateId).toLowerCase();
  if (!value) {
    return false;
  }
  return (
    value.includes('testpoint') ||
    /(?:^|_)tp(?:_|$)/.test(value) ||
    value.includes('fiducial') ||
    /(?:^|_)a[0-4]_?frame(?:_|$)/.test(value)
  );
}

export function isValidationHelperLibraryId(libraryId: string | null | undefined) {
  const value = normalize(libraryId).toLowerCase();
  if (!value) {
    return false;
  }
  const tail = value.includes(':') ? value.split(':').at(-1) ?? value : value;
  return (
    tail === 'testpoint' ||
    tail === 'tp' ||
    tail.includes('testpoint') ||
    /(?:^|[_-])tp(?:[_-]|$)/.test(tail) ||
    tail.startsWith('testpoint_') ||
    tail.startsWith('testpoint-') ||
    tail.startsWith('tp_') ||
    tail.startsWith('tp-') ||
    tail.includes(':tp_') ||
    tail.includes('fiducial') ||
    /(?:^|-)a[0-4]-?frame(?:-|$)/.test(tail)
  );
}

export function isReportableValidationComponent(component: ComponentLike) {
  const reference = getComponentReportReference(component);
  if (!reference || reference.startsWith('#')) {
    return false;
  }

  const libraryId = component.libId ?? component.libraryId;
  if (isKiCadPowerTemplateId(component.templateId) || isKiCadPowerLibraryId(libraryId)) {
    return false;
  }

  if (
    isNonElectricalLibraryId(libraryId) ||
    isValidationHelperTemplateId(component.templateId) ||
    isValidationHelperLibraryId(libraryId)
  ) {
    return false;
  }

  return true;
}
