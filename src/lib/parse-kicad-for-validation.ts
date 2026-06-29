/**
 * Public entrypoint for the v3 KiCad validation extraction pipeline.
 *
 * This path is intentionally separate from `kicad-sch-parser.ts` so that:
 * - legacy canvas import stays isolated
 * - validation / AI analysis code depends only on the verification-oriented model
 */

export { parseKiCadSchematicToUnifiedCircuitModel as parseKiCadForValidation } from '@/lib/v3-kicad-parser';
export { parseKiCadSchematicToLightweightValidationJson } from '@/lib/v3-kicad-parser';
