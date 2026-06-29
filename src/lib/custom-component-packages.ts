import type {
  ComponentTemplate,
  CustomComponentPackage,
  DatasheetStatus,
} from '@/types';
import { sanitizeMultilineText, sanitizePlainText } from '@/lib/security-input';

const ALLOWED_CATEGORIES = new Set(['SENSOR', 'ACTUATOR', 'DISPLAY', 'COMMUNICATION', 'PASSIVE']);
const ALLOWED_VOLTAGES = new Set(['BOTH', '5V', '3.3V']);
const DEFAULT_ICON = 'Microchip';

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function coerceDatasheetStatus(value: unknown): DatasheetStatus {
  if (
    value === 'official-complete' ||
    value === 'official-partial' ||
    value === 'generic-module' ||
    value === 'needs-vendor-pin'
  ) {
    return value;
  }

  return 'official-partial';
}

export function validateCustomComponentPackage(payload: unknown) {
  const errors: string[] = [];

  if (!isObject(payload)) {
    return { valid: false as const, errors: ['패키지 JSON 객체를 읽을 수 없습니다.'] };
  }

  const version = typeof payload.version === 'string' && payload.version.trim()
    ? sanitizePlainText(payload.version, { maxLength: 32, fallback: '1.0.0' })
    : '1.0.0';
  const templateId = sanitizePlainText(payload.templateId, { maxLength: 80 });
  const name = sanitizePlainText(payload.name, { maxLength: 80 });
  const compatibleVoltage = typeof payload.compatibleVoltage === 'string'
    ? sanitizePlainText(payload.compatibleVoltage, { maxLength: 8 })
    : '';
  const category = typeof payload.category === 'string' ? sanitizePlainText(payload.category, { maxLength: 32, fallback: 'SENSOR' }) : 'SENSOR';

  if (!templateId) {
    errors.push('templateId가 비어 있습니다.');
  }
  if (!name) {
    errors.push('name이 비어 있습니다.');
  }
  if (!ALLOWED_VOLTAGES.has(compatibleVoltage)) {
    errors.push('compatibleVoltage는 BOTH, 5V, 3.3V 중 하나여야 합니다.');
  }
  if (!ALLOWED_CATEGORIES.has(category)) {
    errors.push('category는 SENSOR, ACTUATOR, DISPLAY, COMMUNICATION, PASSIVE 중 하나여야 합니다.');
  }

  const requiredPins = Array.isArray(payload.requiredPins)
    ? payload.requiredPins.flatMap(pin => {
        if (!isObject(pin) || typeof pin.name !== 'string' || !Array.isArray(pin.allowedTypes)) {
          return [];
        }

        const allowedTypes = pin.allowedTypes.filter(type =>
          ['DIGITAL', 'ANALOG', 'PWM', 'POWER', 'GND'].includes(String(type))
        ) as Array<'DIGITAL' | 'ANALOG' | 'PWM' | 'POWER' | 'GND'>;

        if (allowedTypes.length === 0) {
          return [];
        }

        const preferredSide =
          pin.preferredSide === 'left' || pin.preferredSide === 'right'
            ? (pin.preferredSide as 'left' | 'right')
            : undefined;

        return [{
          name: sanitizePlainText(pin.name, { maxLength: 48 }),
          allowedTypes,
          preferredSide,
          allowBoardRails: Boolean(pin.allowBoardRails),
        }];
      })
    : [];

  if (requiredPins.length === 0) {
    errors.push('requiredPins에는 최소 1개 이상의 유효한 핀이 필요합니다.');
  }

  if (errors.length > 0) {
    return { valid: false as const, errors };
  }

  const normalized: CustomComponentPackage = {
    version,
    templateId,
    name,
    category: category as ComponentTemplate['category'],
    description:
      typeof payload.description === 'string' && payload.description.trim()
        ? sanitizeMultilineText(payload.description, { maxLength: 240 })
        : `${name} 커스텀 부품`,
    icon:
      typeof payload.icon === 'string' && payload.icon.trim()
        ? sanitizePlainText(payload.icon, { maxLength: 48, fallback: DEFAULT_ICON })
        : DEFAULT_ICON,
    defaultValue:
      typeof payload.defaultValue === 'string' && payload.defaultValue.trim()
        ? sanitizePlainText(payload.defaultValue, { maxLength: 64 })
        : undefined,
    compatibleVoltage: compatibleVoltage as ComponentTemplate['compatibleVoltage'],
    requiredPins,
    dependencies: isObject(payload.dependencies)
      ? {
          arduino: Array.isArray(payload.dependencies.arduino)
            ? payload.dependencies.arduino.flatMap(dep => {
                if (!isObject(dep) || typeof dep.name !== 'string') {
                  return [];
                }
                return [{
                  name: sanitizePlainText(dep.name, { maxLength: 80 }),
                  version: typeof dep.version === 'string' ? sanitizePlainText(dep.version, { maxLength: 32 }) : undefined,
                  registry: 'arduino' as const,
                }];
              })
            : undefined,
          python: Array.isArray(payload.dependencies.python)
            ? payload.dependencies.python.flatMap(dep => {
                if (!isObject(dep) || typeof dep.name !== 'string') {
                  return [];
                }
                return [{
                  name: sanitizePlainText(dep.name, { maxLength: 80 }),
                  version: typeof dep.version === 'string' ? sanitizePlainText(dep.version, { maxLength: 32 }) : undefined,
                  registry: 'python' as const,
                }];
              })
            : undefined,
        }
      : undefined,
    schematic: isObject(payload.schematic)
      ? {
          symbol:
            typeof payload.schematic.symbol === 'string' && payload.schematic.symbol.trim()
              ? sanitizePlainText(payload.schematic.symbol, { maxLength: 64 })
              : templateId.replace(/^tpl_/, ''),
          referencePrefix:
            typeof payload.schematic.referencePrefix === 'string' && payload.schematic.referencePrefix.trim()
              ? sanitizePlainText(payload.schematic.referencePrefix, { maxLength: 8, fallback: 'U' })
              : 'U',
        }
      : undefined,
    aiHints: isObject(payload.aiHints)
      ? Object.entries(payload.aiHints).reduce<Record<string, string>>((acc, [key, value]) => {
        if (typeof value === 'string' && value.trim()) {
          const sanitizedKey = sanitizePlainText(key, { maxLength: 48 });
          const sanitizedValue = sanitizeMultilineText(value, { maxLength: 600 });
          if (sanitizedKey && sanitizedValue) {
            acc[sanitizedKey] = sanitizedValue;
          }
        }
        return acc;
      }, {})
      : undefined,
    design: isObject(payload.design)
      ? {
          datasheetStatus: coerceDatasheetStatus(payload.design.datasheetStatus),
          preferredInterface:
            payload.design.preferredInterface === 'GPIO' ||
            payload.design.preferredInterface === 'ANALOG' ||
            payload.design.preferredInterface === 'I2C' ||
            payload.design.preferredInterface === 'SPI' ||
            payload.design.preferredInterface === 'UART' ||
            payload.design.preferredInterface === 'SINGLE_BUS'
              ? payload.design.preferredInterface
              : undefined,
          datasheetSources: Array.isArray(payload.design.datasheetSources)
            ? payload.design.datasheetSources.flatMap(source => {
                if (!isObject(source) || typeof source.label !== 'string' || typeof source.url !== 'string') {
                  return [];
                }
                return [{
                  label: sanitizePlainText(source.label, { maxLength: 120 }),
                  url: sanitizePlainText(source.url, { maxLength: 320 }),
                }];
              })
            : undefined,
          warnings: Array.isArray(payload.design.warnings)
            ? payload.design.warnings.flatMap(warning => {
                if (
                  !isObject(warning) ||
                  typeof warning.title !== 'string' ||
                  typeof warning.message !== 'string'
                ) {
                  return [];
                }
                return [{
                  severity:
                    warning.severity === 'error' || warning.severity === 'info'
                      ? warning.severity
                      : 'warning',
                  title: sanitizePlainText(warning.title, { maxLength: 120 }),
                  message: sanitizeMultilineText(warning.message, { maxLength: 320 }),
                }];
              })
            : undefined,
        }
      : undefined,
  };

  return { valid: true as const, data: normalized };
}

export function customComponentPackageToTemplate(pkg: CustomComponentPackage): ComponentTemplate {
  return {
    id: pkg.templateId,
    name: pkg.name,
    category: pkg.category ?? 'SENSOR',
    description: pkg.description ?? `${pkg.name} 커스텀 부품`,
    icon: pkg.icon ?? DEFAULT_ICON,
    compatibleVoltage: pkg.compatibleVoltage,
    requiredPins: pkg.requiredPins,
    defaultValue: pkg.defaultValue,
    librarySource: 'custom',
    packageVersion: pkg.version,
    dependencies: pkg.dependencies,
    aiHints: pkg.aiHints,
    schematic: pkg.schematic?.symbol || pkg.schematic?.referencePrefix
      ? {
          symbol: pkg.schematic?.symbol ?? pkg.templateId.replace(/^tpl_/, ''),
          referencePrefix: pkg.schematic?.referencePrefix ?? 'U',
        }
      : undefined,
    design: pkg.design
      ? {
          datasheetStatus: pkg.design.datasheetStatus ?? 'official-partial',
          datasheetSources: pkg.design.datasheetSources,
          preferredInterface: pkg.design.preferredInterface,
          warnings: pkg.design.warnings,
          tags: pkg.design.tags,
          requiresExternalParts: pkg.design.requiresExternalParts,
        }
      : undefined,
  };
}
