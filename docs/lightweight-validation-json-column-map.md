# Lightweight Validation JSON -> SQL Column Map

이 문서는 `/Users/gimdong-il/Desktop/프로그램/modumake/docs/lightweight-validation-json.example.json` 기준으로,
현재 v3 검증 파이프라인의 **실제 ingest 기준 포맷**이 어디에 저장되는지 정리합니다.

핵심 원칙은 간단합니다.

1. `/api/ai/analyze` 와 payload builder의 단일 입력 포맷은 `LightweightValidationJson`
2. DB 저장도 같은 포맷을 기준으로 한다
3. 더 무거운 `integrated_model_json` 은 선택적 보조 스냅샷으로만 둔다

즉, **현재 canonical ingest input 은 lightweight validation JSON** 입니다.

## Top-level

| JSON path | Primary SQL target | Notes |
| --- | --- | --- |
| `schema_version` | `validation_jobs.schema_version` | 입력 계약 버전 |
| `source.project_name` | `validation_jobs.project_name` | 저장 단위 프로젝트명 |
| `source.source_file_kind` | `validation_jobs.validation_input_json -> 'source' ->> 'source_file_kind'` | 현재는 `kicad_sch` |
| whole payload | `validation_jobs.validation_input_json` | canonical ingest snapshot |
| optional richer payload | `validation_jobs.integrated_model_json` | 선택적 보조 스냅샷 |

## `components[*]`

| JSON path | SQL target |
| --- | --- |
| `components[*].instance_id` | `component_instances.instance_id` |
| `components[*].ref` | `component_instances.refdes` |
| `components[*].lib_id` | `component_instances.lib_id` |
| `components[*].symbol_name` | `component_instances.symbol_name` |
| `components[*].value` | `component_instances.value` |
| `components[*].footprint` | `component_instances.footprint` |
| `components[*].mpn_candidates[]` | `component_instances.mpn_candidates` |
| `components[*].pins[*]` | `component_instances.pin_net_map` |

Derived arrays:

| Derived from | SQL target |
| --- | --- |
| pin names | `component_instances.pin_names` |
| connected net labels | `component_instances.net_labels` |
| connected net ids | `component_instances.connected_net_ids` |

## `nets[*]`

| JSON path | SQL target |
| --- | --- |
| `nets[*].net_id` | `validation_nets.net_id` |
| `nets[*].label` | `validation_nets.label` |
| `nets[*].aliases[]` | `validation_nets.aliases` |
| `nets[*].kind` | `validation_nets.kind` |
| `nets[*].connected_pins[*]` | `validation_net_members` |

Net members are resolved as:

| JSON path | SQL target |
| --- | --- |
| `connected_pins[*].ref` | `validation_net_members.owner_reference` |
| component ref lookup | `validation_net_members.owner_id` |
| `connected_pins[*].pin_number` | `validation_net_members.pin_id` |
| `connected_pins[*].pin_name` | `validation_net_members.pin_name` |

## `code_pin_usage[*]`

| JSON path | SQL target |
| --- | --- |
| `operationType` | `code_pin_usages.operation_type` |
| `pinArgument` | `code_pin_usages.pin_argument` |
| `matchedMcuPinLabel` | `code_pin_usages.matched_mcu_pin_label` |
| `lineNumber` | `code_pin_usages.line_number` |
| `scope` | `code_pin_usages.scope` |
| `mode` | `code_pin_usages.mode` |
| `value` | `code_pin_usages.value` |
| `conditional` | `code_pin_usages.conditional` |
| `conditions[]` | `code_pin_usages.conditions_json` |
| `callPath[]` | `code_pin_usages.call_path_json` |
| `connectedNetLabels[]` | `code_pin_usages.connected_net_labels` |
| `connectedComponentReferences[]` | `code_pin_usages.connected_component_references` |

## `validation_flags[*]`

Primary normalized target:

- `error_findings`

Snapshot target:

- `validation_jobs.validation_flags_json`

| JSON path | SQL target |
| --- | --- |
| `source` | `error_findings.source_engine` |
| `severity` | `error_findings.severity` |
| `code` | `error_findings.finding_code` |
| `ruleId` | `error_findings.rule_id` |
| `title` | `error_findings.title` |
| `message` | `error_findings.message` |
| `componentReference` | `error_findings.component_instance_id` via `refdes` lookup |
| `boardPin` | `error_findings.board_pin` |
| `lineNumber` | `error_findings.line_number` |
| `operation` | `error_findings.operation` |
| `recommendation` | `error_findings.recommendation` |

## `rule_findings[*]`

Primary normalized target:

- `error_findings`

Snapshot target:

- `validation_jobs.rule_findings_json`

Rule findings are ingested with:

- `source_engine = 'rule_based'`
- `finding_code = ruleId`

Additional resolution:

| JSON path | SQL target |
| --- | --- |
| `componentReference` | `error_findings.component_instance_id` via `refdes` lookup |
| `netLabel` | `error_findings.validation_net_id` via `validation_nets.label` lookup |

## `unresolved.symbols[*]`

이 값들은 현재 1차 기준으로 별도 정규화 테이블 없이 두 곳에 반영합니다.

| JSON path | SQL target |
| --- | --- |
| `unresolved.symbols[*]` whole array | `validation_jobs.validation_input_json -> 'unresolved' -> 'symbols'` |
| count | `validation_jobs.unresolved_symbol_count` |

## `stats`

| JSON path | SQL target |
| --- | --- |
| `stats.component_count` | `validation_jobs.component_count` |
| `stats.net_count` | `validation_jobs.net_count` |
| `stats.unresolved_symbol_count` | `validation_jobs.unresolved_symbol_count` |
| `stats.wire_segment_count` | `validation_jobs.imported_connection_count` |
| `stats.label_count` | derived, snapshot also remains in `validation_input_json` |

## Write order

권장 ingest 순서:

1. `validation_jobs`
2. `validation_nets`
3. `validation_net_members`
4. `component_instances`
5. `code_pin_usages`
6. `error_findings`

이 순서면 lookup 기준이 먼저 생기고, `componentReference` / `netLabel` FK 해석도 안정적으로 붙일 수 있습니다.
