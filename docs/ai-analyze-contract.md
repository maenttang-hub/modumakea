# AI Analyze Contract

이 문서는 `/api/ai/analyze` 가 받는 **단일 입력 포맷**과 imported schematic 경로의 우선순위를 고정합니다.

## Canonical request body

`POST /api/ai/analyze`

```json
{
  "validationInput": {
    "schema_version": "2026-06-19",
    "source": {
      "source_file_kind": "kicad_sch",
      "project_name": "Example Project"
    },
    "components": [],
    "nets": [],
    "unresolved": { "symbols": [] },
    "code_pin_usage": [],
    "validation_flags": [],
    "rule_findings": [],
    "stats": {
      "component_count": 0,
      "net_count": 0,
      "unresolved_symbol_count": 0,
      "wire_segment_count": 0,
      "junction_count": 0,
      "label_count": 0
    }
  },
  "preferredProvider": "anthropic"
}
```

핵심 규칙은 간단합니다.

1. `/api/ai/analyze` 의 입력 계약은 `LightweightValidationJson`
2. UI / payload builder / 저장 라우트는 모두 이 포맷을 기준으로 맞춘다
3. 더 무거운 integrated validation JSON은 **보조 스냅샷**이지, AI 라우트의 canonical request body 가 아니다

## Imported schematic resolution order

imported schematic 프로젝트에서는 아래 순서로 AI 입력을 만듭니다.

1. 저장본 안에 `integratedValidationJson` 이 있으면 그것을 먼저 사용
2. 없지만 `importedSchematicSource` 가 있으면, 원본 `.kicad_sch` 를 v3 파서로 다시 읽어 `LightweightValidationJson` 생성
3. 둘 다 없으면 공용 fallback 경로 사용

즉:

- **새로 import 한 프로젝트**나
- **같은 KiCad 파일을 다시 import 한 프로젝트**

는 이후부터 v3 직행 경로를 탈 수 있습니다.

반대로 **legacy imported 저장본**은 원본 `.kicad_sch` 텍스트가 문서 안에 없을 수 있으므로, 그런 경우 AI 입력은 fallback 경로를 탈 수 있습니다.

## Very short sample

실제 패널이나 로그에서 사람이 빠르게 확인할 때는 이 정도면 충분합니다.

```json
{
  "schema_version": "2026-06-19",
  "source": { "source_file_kind": "kicad_sch", "project_name": "rasphat_proj2" },
  "components": [{ "ref": "U1", "lib_id": "Sensor:DHT22" }],
  "nets": [{ "label": "DATA", "kind": "signal" }],
  "stats": { "component_count": 16, "net_count": 14, "wire_segment_count": 34 }
}
```

## Related files

- `/Users/gimdong-il/Desktop/프로그램/modumake/docs/ai-analyze-request.example.json`
- `/Users/gimdong-il/Desktop/프로그램/modumake/src/types/ai-analyze.ts`
- `/Users/gimdong-il/Desktop/프로그램/modumake/src/app/api/ai/analyze/route.ts`
- `/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/resolve-validation-ai-input.ts`
- `/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/build-lightweight-validation-json.ts`
- `/Users/gimdong-il/Desktop/프로그램/modumake/docs/lightweight-validation-json.example.json`
