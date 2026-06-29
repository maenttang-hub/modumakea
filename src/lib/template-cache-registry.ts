import type { ComponentTemplate, PlacedComponent } from '@/types';

let runtimeTemplateCache: Record<string, ComponentTemplate> = {};

export function getRuntimeTemplateCache() {
  return runtimeTemplateCache;
}

export function setRuntimeTemplateCache(cache: Record<string, ComponentTemplate>) {
  runtimeTemplateCache = { ...cache };
}

export function mergeRuntimeTemplateCache(templates: ComponentTemplate[]) {
  if (templates.length === 0) {
    return runtimeTemplateCache;
  }

  const nextCache = { ...runtimeTemplateCache };
  for (const template of templates) {
    nextCache[template.id] = template;
  }
  runtimeTemplateCache = nextCache;
  return runtimeTemplateCache;
}

export function pickReferencedTemplateCache(
  components: PlacedComponent[],
  templateCache: Record<string, ComponentTemplate>
) {
  const nextCache: Record<string, ComponentTemplate> = {};

  for (const component of components) {
    const template = templateCache[component.templateId];
    if (!template) {
      continue;
    }
    nextCache[component.templateId] = template;
  }

  return nextCache;
}
