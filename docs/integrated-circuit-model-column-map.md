# Integrated Circuit Model -> SQL Column Map

이 문서는 `/Users/gimdong-il/Desktop/프로그램/modumake/docs/integrated-circuit-model.example.json` 의 각 필드가
어디에 저장되는지 1차 기준을 정리한 표입니다.

기준 스키마:

- `/Users/gimdong-il/Desktop/프로그램/modumake/docs/ai-review-schema.sql`

원칙은 두 겹입니다.

1. **재현 스냅샷**: `validation_jobs.integrated_model_json`
2. **검색 / 통계 / 리포트용 정규화 컬럼**

즉, 모든 필드는 JSON 스냅샷에 남고, 자주 질의할 것만 행/컬럼으로 더 꺼냅니다.

## Top-level

| JSON path | Primary SQL target | Shape | Notes |
| --- | --- | --- | --- |
| `schemaVersion` | `validation_jobs.schema_version` | scalar | 스냅샷 버전 추적 |
| `project` | `validation_jobs.integrated_model_json -> 'project'` | jsonb | 전체 스냅샷 유지 |
| `board` | `validation_jobs.integrated_model_json -> 'board'` | jsonb | 전체 스냅샷 유지 |
| `components` | `component_instances` + `component_instances.pin_net_map` | rows + jsonb | 부품별 행, 핀 배열은 jsonb |
| `nets` | `validation_nets` + `validation_net_members` | rows | net / member를 직접 검색 가능하게 분리 |
| `codePinUsage` | `code_pin_usages` | rows | 코드 핀 사용 기록 |
| `validationFlags` | `error_findings` + `validation_jobs.validation_flags_json` | rows + jsonb | 엔진별 플래그를 결과 이슈 테이블에 저장 |
| `ruleFindings` | `error_findings` + `validation_jobs.rule_findings_json` | rows + jsonb | rule-based subset |
| `extractionPlan` | `validation_jobs.extraction_plan_json` + `validation_extraction_targets` | jsonb + rows | 대상별 추출 질의/질문 분리 |

## `project`

| JSON path | SQL target |
| --- | --- |
| `project.projectName` | `validation_jobs.project_name` |
| `project.boardId` | `validation_jobs.board_id` |
| `project.boardName` | `validation_jobs.board_name` |
| `project.sourceKind` | `validation_jobs.source_kind` |
| `project.importedComponentCount` | `validation_jobs.imported_component_count` |
| `project.importedConnectionCount` | `validation_jobs.imported_connection_count` |
| `project.generatedCustomComponentCount` | `validation_jobs.generated_custom_component_count` |

## `board`

| JSON path | SQL target |
| --- | --- |
| `board.boardId` | `validation_jobs.board_id` |
| `board.boardName` | `validation_jobs.board_name` |
| `board.logicVoltage` | `validation_jobs.logic_voltage` |
| `board.netLabels[]` | `validation_jobs.board_net_labels` |
| `board.pinNames[]` | `validation_jobs.board_pin_names` |

## `components[*]`

One row per component goes into `component_instances`.

| JSON path | SQL target |
| --- | --- |
| `components[*].instanceId` | `component_instances.instance_id` |
| `components[*].reference` | `component_instances.refdes` |
| `components[*].displayName` | `component_instances.display_name` |
| `components[*].value` | `component_instances.value` |
| `components[*].category` | `component_instances.category` |
| `components[*].sourceKind` | `component_instances.source_kind` |
| `components[*].templateId` | `component_instances.template_id` |
| `components[*].libraryId` | `component_instances.lib_id` |
| `components[*].footprint` | `component_instances.footprint` |
| `components[*].symbolName` | `component_instances.symbol_name` |
| `components[*].referencePrefix` | `component_instances.reference_prefix` |
| `components[*].pinNames[]` | `component_instances.pin_names` |
| `components[*].netLabels[]` | `component_instances.net_labels` |
| `components[*].connectedNetIds[]` | `component_instances.connected_net_ids` |
| `components[*].mpnCandidates[]` | `component_instances.mpn_candidates` |
| `components[*].manufacturerCandidates[]` | `component_instances.manufacturer_candidates` |
| `components[*].tags[]` | `component_instances.tags` |
| `components[*].pins[*]` | `component_instances.pin_net_map` |

### `components[*].pins[*]` JSONB shape

Stored inside `component_instances.pin_net_map` as an array of objects:

- `pinId`
- `pinName`
- `pinNumber`
- `direction`
- `electricalType`
- `assignedBoardPin`
- `connectedNetIds`
- `netLabels`
- `protocols`

## `nets[*]`

One row per net in `validation_nets`, and one row per member in `validation_net_members`.

| JSON path | SQL target |
| --- | --- |
| `nets[*].netId` | `validation_nets.net_id` |
| `nets[*].label` | `validation_nets.label` |
| `nets[*].kind` | `validation_nets.kind` |
| `nets[*].memberRefs[*].ownerType` | `validation_net_members.owner_type` |
| `nets[*].memberRefs[*].ownerId` | `validation_net_members.owner_id` |
| `nets[*].memberRefs[*].ownerReference` | `validation_net_members.owner_reference` |
| `nets[*].memberRefs[*].pinId` | `validation_net_members.pin_id` |
| `nets[*].memberRefs[*].pinName` | `validation_net_members.pin_name` |

## `codePinUsage[*]`

One row per usage in `code_pin_usages`.

| JSON path | SQL target |
| --- | --- |
| `codePinUsage[*].operationType` | `code_pin_usages.operation_type` |
| `codePinUsage[*].pinArgument` | `code_pin_usages.pin_argument` |
| `codePinUsage[*].matchedMcuPinLabel` | `code_pin_usages.matched_mcu_pin_label` |
| `codePinUsage[*].lineNumber` | `code_pin_usages.line_number` |
| `codePinUsage[*].scope` | `code_pin_usages.scope` |
| `codePinUsage[*].mode` | `code_pin_usages.mode` |
| `codePinUsage[*].value` | `code_pin_usages.value` |
| `codePinUsage[*].conditional` | `code_pin_usages.conditional` |
| `codePinUsage[*].conditions[]` | `code_pin_usages.conditions_json` |
| `codePinUsage[*].callPath[]` | `code_pin_usages.call_path_json` |
| `codePinUsage[*].connectedNetLabels[]` | `code_pin_usages.connected_net_labels` |
| `codePinUsage[*].connectedComponentReferences[]` | `code_pin_usages.connected_component_references` |

## `validationFlags[*]`

Primary normalized target is `error_findings`.

| JSON path | SQL target |
| --- | --- |
| `validationFlags[*].source` | `error_findings.source_engine` |
| `validationFlags[*].severity` | `error_findings.severity` |
| `validationFlags[*].code` | `error_findings.finding_code` |
| `validationFlags[*].ruleId` | `error_findings.rule_id` |
| `validationFlags[*].title` | `error_findings.title` |
| `validationFlags[*].message` | `error_findings.message` |
| `validationFlags[*].boardPin` | `error_findings.board_pin` |
| `validationFlags[*].lineNumber` | `error_findings.line_number` |
| `validationFlags[*].operation` | `error_findings.operation` |
| `validationFlags[*].recommendation` | `error_findings.recommendation` |

The original array also remains in:

- `validation_jobs.validation_flags_json`

## `ruleFindings[*]`

These are also stored in `error_findings`, typically with `source_engine = 'rule_based'`.

| JSON path | SQL target |
| --- | --- |
| `ruleFindings[*].severity` | `error_findings.severity` |
| `ruleFindings[*].ruleId` | `error_findings.rule_id` |
| `ruleFindings[*].title` | `error_findings.title` |
| `ruleFindings[*].message` | `error_findings.message` |
| `ruleFindings[*].componentReference` | `component_instances.refdes` lookup -> `error_findings.component_instance_id` |
| `ruleFindings[*].boardPin` | `error_findings.board_pin` |
| `ruleFindings[*].netLabel` | `error_findings.net_label` |
| `ruleFindings[*].recommendation` | `error_findings.recommendation` |

The original array also remains in:

- `validation_jobs.rule_findings_json`

## Resolution rules

정규화 과정에서 몇몇 필드는 문자열 그대로 저장되지 않고, 같은 `validation_job_id` 범위 안에서
FK나 참조 대상으로 해석됩니다.

| Source field | Resolution rule | Fallback when unresolved |
| --- | --- | --- |
| `ruleFindings[*].componentReference` | `component_instances.validation_job_id + refdes` 로 찾아 `error_findings.component_instance_id` 에 연결 | 원본 문자열은 `error_findings.evidence_json` 에 남김 |
| `ruleFindings[*].netLabel` | `validation_nets.validation_job_id + label` 로 찾아 `error_findings.validation_net_id` 또는 `error_findings.net_label` 에 반영 | 라벨 문자열만 `error_findings.net_label` 에 저장 |
| `validationFlags[*].boardPin` | 별도 FK 없이 `error_findings.board_pin` 에 문자열 저장 | 동일 |
| `codePinUsage[*].connectedComponentReferences[]` | 조회/리포트에서 `component_instances.refdes` 와 조인 | 문자열 배열 자체는 `code_pin_usages.connected_component_references` 에 보존 |

## `extractionPlan`

| JSON path | SQL target |
| --- | --- |
| `extractionPlan.strategy` | `validation_jobs.extraction_plan_json ->> 'strategy'` |
| `extractionPlan.globalSections[]` | `validation_jobs.extraction_plan_json -> 'globalSections'` |
| `extractionPlan.targets[*].reference` | `validation_extraction_targets.reference` |
| `extractionPlan.targets[*].displayName` | `validation_extraction_targets.display_name` |
| `extractionPlan.targets[*].libraryId` | `validation_extraction_targets.library_id` |
| `extractionPlan.targets[*].footprint` | `validation_extraction_targets.footprint` |
| `extractionPlan.targets[*].mpnCandidates[]` | `validation_extraction_targets.mpn_candidates` |
| `extractionPlan.targets[*].manufacturerCandidates[]` | `validation_extraction_targets.manufacturer_candidates` |
| `extractionPlan.targets[*].requestedSections[]` | `validation_extraction_targets.requested_sections` |
| `extractionPlan.targets[*].searchQueries[]` | `validation_extraction_targets.search_queries` |
| `extractionPlan.targets[*].reviewQuestions[]` | `validation_extraction_targets.review_questions` |

## Recommended write order

1. `validation_jobs`
2. `validation_nets`
3. `validation_net_members`
4. `component_instances`
5. `code_pin_usages`
6. `error_findings`
7. `validation_extraction_targets`
8. `substitute_suggestions`

That keeps the snapshot first, then the searchable rows, then the optional recommendation layer.

## Snapshot-only and derived fields

아래 값들은 1차 기준으로는 별도 정규화 테이블 없이 JSON 스냅샷이나 파생 컬럼으로만 유지합니다.

| Field | Storage rule |
| --- | --- |
| `project` / `board` 전체 객체 | `validation_jobs.integrated_model_json` 에 전체 보존 |
| `validationFlags[*]` 원본 배열 | `validation_jobs.validation_flags_json` 에 전체 보존 |
| `ruleFindings[*]` 원본 배열 | `validation_jobs.rule_findings_json` 에 전체 보존 |
| `extractionPlan` 전체 객체 | `validation_jobs.extraction_plan_json` 에 전체 보존 |
| downstream AI 추천 결과 | `substitute_suggestions` 에 정규화, 필요 시 원본 vendor 응답은 `raw_vendor_payload` 에 보존 |

즉, 이 문서의 컬럼 매핑은 "검색 가능한 1차 인덱스" 기준이고, 재현 가능한 원본은 항상
`validation_jobs.integrated_model_json` 을 기준으로 복구할 수 있게 유지합니다.
