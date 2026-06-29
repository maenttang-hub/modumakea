import type { ComponentTemplate, CustomComponentPackage } from '@/types';
import { customComponentPackageToTemplate, validateCustomComponentPackage } from '@/lib/custom-component-packages';

export const CUSTOM_COMPONENTS_STORAGE_KEY = 'modumake-custom-components-v1';

let runtimeCustomPackages: CustomComponentPackage[] = [];
let runtimeCustomTemplates: ComponentTemplate[] = [];

export function getRuntimeCustomComponentPackages() {
  return runtimeCustomPackages;
}

export function getRuntimeCustomComponentTemplates() {
  return runtimeCustomTemplates;
}

export function setRuntimeCustomComponentPackages(packages: CustomComponentPackage[]) {
  const deduped = new Map<string, CustomComponentPackage>();
  for (const pkg of packages) {
    deduped.set(pkg.templateId, pkg);
  }

  runtimeCustomPackages = Array.from(deduped.values());
  runtimeCustomTemplates = runtimeCustomPackages.map(customComponentPackageToTemplate);
}

export function loadRuntimeCustomComponentPackagesFromBrowser() {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(CUSTOM_COMPONENTS_STORAGE_KEY);
    if (!raw) {
      setRuntimeCustomComponentPackages([]);
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      setRuntimeCustomComponentPackages([]);
      return [];
    }

    const packages = parsed.flatMap(entry => {
      const result = validateCustomComponentPackage(entry);
      return result.valid ? [result.data] : [];
    });

    setRuntimeCustomComponentPackages(packages);
    return packages;
  } catch {
    setRuntimeCustomComponentPackages([]);
    return [];
  }
}
