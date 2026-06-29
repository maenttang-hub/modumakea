# v3 KiCad Validation Pipeline

This document defines the separation between the legacy KiCad canvas importer and the v3 verification parser.

## Legacy importer

File:

- `/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/kicad-sch-parser.ts`

Purpose:

- Convert `.kicad_sch` into `ModuMakeProjectData`
- Support the legacy imported-canvas flow
- Preserve geometry, fallback symbols, and canvas-facing document state

Non-goals:

- AI validation payload extraction
- Provider-neutral circuit model generation
- Template-free external schematic verification

## v3 validation parser

Entrypoint:

- `/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/parse-kicad-for-validation.ts`

Implementation:

- `/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/v3-kicad-parser/`

Purpose:

- Extract `symbol + pin + net + label` from `.kicad_sch`
- Produce a validation-oriented integrated circuit model
- Surface unresolved symbols explicitly
- Stay independent from board templates and canvas document types

## Architectural rule

New validation, AI review, HW/SW consistency, and datasheet-checking code must depend on the v3 parser path, not on the legacy importer.

## Current v3 flow

1. `s-expr-parser.ts`
2. `v3-kicad-parser/extractors/*`
3. `v3-kicad-parser/net-resolver.ts`
4. `v3-kicad-parser/unresolved-tracker.ts`
5. `v3-kicad-parser/circuit-model-serializer.ts`

## Expected output

The v3 parser produces a unified circuit model that is suitable for:

- integrated validation JSON
- code pin usage matching
- AI analysis routes
- datasheet review payload builders
