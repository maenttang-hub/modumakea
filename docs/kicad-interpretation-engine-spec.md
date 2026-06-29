# KiCad 회로 해석 엔진 구현 명세서

문서 버전: `v1.0`  
대상: Codex / 구현 에이전트 / 기술 검수용  
선행 문서: `KiCad 회로 해석 엔진 접근 전략 보고서`, `v0.1`, `v0.2`, `v0.3`

## 0. 목적

본 문서는 KiCad schematic을 `문자 파싱 결과`와 `렌더링 이미지 인식 결과`로 이중 해석한 뒤, 이를 매칭하여 기능 블록, 커넥터 역할, 시트 구조, 시각적 의도를 추론하는 엔진의 구현 기준을 정의한다.

핵심 원칙은 다음과 같다.

- 문자 파싱 결과는 항상 구조적 진실의 기준선이다.
- 이미지 인식은 의도 해석 보조다.
- LLM은 의미 가설만 생성한다.
- 최종 판정은 규칙 엔진이 수행한다.
- 불확실한 항목은 강제 확정하지 않는다.

## 1. 범위

### 1.1 포함 범위

- `.kicad_sch` 파싱
- schematic 전체 렌더링 및 부분 렌더링
- 시각 블록 후보 추출
- 문자 파싱 결과와 시각 블록 매칭
- 기능 블록 / 커넥터 역할 / 시트 의미 추론
- confidence 기반 해석 리포트 생성

### 1.2 제외 범위

- PCB 자동 배치 및 배선
- schematic 수정 및 재저장
- 범용 BOM 복원
- 제조용 DFM/DRC 판단
- 최종 설계 의도 100% 복원 보장

## 2. 전체 구조

```text
[kicad_sch]
   |
   v
Stage 1. Parser
   -> parsed.json
   -> parse_index.json
   |
   v
Stage 2. Renderer
   -> environment_check.json
   -> render_full.png
   -> render_full.svg
   -> coord_map.json
   |
   v
Stage 2.5. Coordinate Calibration
   -> coord_validation.json
   |
   v
Stage 3. Vision
   3a. Coarse Regions
   3b. Region Deduplication
   3c. Structural Crop Expansion
   3d. Fine Inspection
   -> coarse_regions.json
   -> fine_regions.json
   |
   v
Stage 4. Matcher
   4a. Geometry Match
   4b. Structural/Signal Pattern Match
   4c. Optional LLM Hypothesis
   4d. Rule Resolution
   -> interpretation_report.json
   -> interpretation_report.md
```

## 3. 최상위 설계 원칙

### 3.1 Truth Baseline

`Stage 1 Parser`의 연결성, 엔티티, 좌표 정보는 최종 기준선이다. 다른 Stage는 이를 보완할 수는 있어도 덮어쓸 수 없다.

### 3.2 Vision Is Intent-Oriented

이미지 인식은 기능 블록, 시각 군집, 라벨 위치, 흐름 방향 같은 시각적 의도를 보강하는 용도로만 사용한다.

### 3.3 LLM Is Advisory

LLM은 가설 생성기다. LLM 출력은 `hypothesis` 타입으로만 저장되며, 규칙 엔진 승인 전에는 최종 의미가 아니다.

### 3.4 Deterministic Resolution First

가능한 한 geometry, structure, signal pattern만으로 먼저 판정한다. LLM 호출은 마지막 보조 단계다.

### 3.5 Fail Softly

일부 블록 해석 실패가 전체 파이프라인 실패로 이어져서는 안 된다. 실패 항목은 `needs_review`로 격리한다.

### 3.6 Thresholds Are Tunable

모든 임계값은 고정 진리가 아니라 초기 추정치다. 코드에 흩어져 하드코딩하지 않고 `config/thresholds.json`에서 단일 관리한다.

## 4. 공통 데이터 모델

### 4.1 좌표계

시스템은 최소 2개 좌표계를 다룬다.

- KiCad logical coordinates: `mm`
- Render image coordinates: `px`

두 좌표계 변환은 반드시 `coord_map.json`과 `coord_validation.json`으로 검증 가능해야 한다.

필수 함수:

```python
def mm_to_px(x_mm: float, y_mm: float, coord_map: dict) -> tuple[float, float]: ...
def px_to_mm(x_px: float, y_px: float, coord_map: dict) -> tuple[float, float]: ...
```

허용 오차:

- coarse match: `<= 2.5mm`
- fine crop remap: `<= 1.0mm`

오차가 이를 넘으면 vision 단계는 제한되거나 중단된다.

### 4.2 Entity Base Schema

모든 엔티티는 다음 베이스 필드를 공유한다.

- `id`
- `type`
- `bbox_mm`
- `raw_ref`

### 4.3 최종 블록 라벨 구조

최종 의미 라벨은 자유문장 하나로 두지 않고 분리한다.

- `block_type`
- `role`
- `freeform_description`
- `confidence`
- `evidence_sources`
- `member_entities`
- `bbox_mm`

이 분리를 통해 평가, 검색, UI 표시, 후속 튜닝을 안정화한다.

### 4.4 Tunable Thresholds

문서 전체에 등장하는 모든 수치 임계값은 `config/thresholds.json`에서 로드한다.

필수 요구사항:

- 모든 Stage는 thresholds를 함수 인자 또는 명시적 설정 객체로 주입받는다.
- 전역 상수 직접 참조를 금지한다.
- 최종 결과물에 `thresholds_version`을 기록한다.

## 5. Stage 1 — Parser

경로 제안: `src/lib/kicad-interpretation/parser/`

### 5.1 입력

- `.kicad_sch` 파일 경로
- 선택적 project root path

### 5.2 처리 목표

다음 구조를 손실 최소화로 추출한다.

- symbols
- pins
- nets
- wires
- labels
- junctions
- text properties
- graphic rects
- sheets
- sheet pins
- hierarchical labels
- cross-sheet links

### 5.3 필수 추출 항목

#### Symbol

- `reference`
- `value`
- `footprint`
- `lib_id`
- `lib_name` if present
- `position_mm`
- `rotation_deg`
- `mirror`
- `bbox_mm`
- `pins[]` absolute positions

#### Pin

- `number`
- `name`
- `electrical_type`
- `position_mm`

#### Label

- `label_type`: `local | global | hierarchical`
- `text`
- `position_mm`

#### Sheet

- `sheet name`
- `sheet file path`
- `bbox_mm`
- `sheet pins[]`

#### Graphic Rect

- `bbox_mm`
- `contained_entities[]`
- `nearby_labels[]`

### 5.4 추가 계산

- `contained_entities`: 모든 rect에 대해 bbox 내부 symbol/text entities 계산
- `nearby_labels`: 각 rect, sheet 주변 text labels 수집
- `cross_sheet_links`: 동일 계층 신호명을 기준으로 상위/하위 시트 연결 기록

### 5.5 출력

- `parsed.json`
- `parse_index.json`

### 5.6 실패 정책

- 일부 symbol parse 실패 시 전체 중단 금지
- 실패 항목은 `errors[]`에 저장
- 하위 시트 누락 시 `warnings[]`에 저장

## 6. Stage 2 — Renderer

경로 제안: `src/lib/kicad-interpretation/renderer/`

### 6.1 입력

- `.kicad_sch` 파일 경로

### 6.2 출력

- `environment_check.json`
- `render_full.png`
- `render_full.svg`
- `coord_map.json`

### 6.3 처리 요구

- KiCad CLI 기반 렌더링 사용
- coarse용 기본 해상도와 fine crop용 고해상도 지원
- 동일 파일에 대해 반복 실행 시 동일 축척/기준점 유지

### 6.4 권장 구현

- `kicad-cli sch export svg`
- 필요 시 SVG -> PNG 변환

PNG만 의존하지 말고 SVG도 유지한다.

### 6.5 외부 의존성 검증

파이프라인 진입 시 `kicad-cli`를 fail-fast로 검증한다.

검증 항목:

- `kicad-cli --version` 실행 가능 여부
- 최소 버전 이상 여부
- `sch export svg` 서브커맨드 존재 여부

검증 결과는 `environment_check.json`에 기록한다.

## 7. Stage 2.5 — Coordinate Calibration

경로 제안: `src/lib/kicad-interpretation/calibration/`

### 7.1 목적

render 좌표와 parser 좌표의 정합성을 검증한다.

### 7.2 입력

- `parsed.json`
- `render_full.svg` 또는 `render_full.png`
- `coord_map.json`

### 7.3 처리

anchor 후보:

- sheet corners
- large rect corners
- symbol centers
- label anchors

parser 기준 위치와 render 기준 위치를 비교해 평균/최대 오차를 계산한다.

### 7.4 출력

- `coord_validation.json`

### 7.5 실패 기준

- `max_error_mm > calibration.max_error_mm_warn`이면 fine pass 금지
- `max_error_mm > calibration.max_error_mm_block`이면 전체 vision pipeline 금지

## 8. Stage 3 — Vision

경로 제안: `src/lib/kicad-interpretation/vision/`

### 8.1 공통 원칙

비전 단계는 가능한 한 관찰만 하고, 최종 의미 단정은 하지 않는다.

### 8.2 3a Coarse Pass

입력:

- `render_full.png`

목적:

- 시각적 군집 후보 추출
- 큰 블록 / 박스 / 커넥터 영역 / 반복 패턴 후보 감지

출력:

- `coarse_regions.json`

구조화 필드 우선:

- `observed_shape_tags`
- `ocr_like_texts`
- `visual_density`

### 8.3 3b Region Deduplication

coarse region 중복과 중첩을 정리한다.

필수 처리:

- 높은 IoU region 병합
- 거의 완전 포함된 작은 region의 suppress 또는 sub-candidate 승격
- `dedup_log` 기록

### 8.4 3c Structural Crop Expansion

입력:

- `coarse_regions.json`
- `parsed.json`
- `coord_map.json`

처리:

1. coarse bbox를 `px -> mm` 역변환
2. intersect entities 조회
3. entity bbox 합집합 기반 crop 범위 재계산
4. margin 자동 확장 재시도
5. 고해상도 crop 렌더 생성

출력:

- `crop_<region_id>.png`
- `crop_<region_id>_entities.json`

### 8.5 3d Fine Pass

입력:

- `crop_<region_id>.png`
- `crop_<region_id>_entities.json`

출력:

- `fine_regions.json`

목적:

- 블록 내부 시각 단서 정밀 관찰

### 8.6 호출 제한

fine pass는 모두 수행하지 않는다.

skip 조건:

- 4a explicit label high confidence
- 4b signal pattern high confidence
- 명확한 boxed region + nearby label 일치

호출 상한은 `vision_pass.max_fine_pass_calls_per_schematic`을 따른다.

## 9. Stage 4 — Matcher

경로 제안: `src/lib/kicad-interpretation/matcher/`

### 9.1 처리 순서

1. Geometry Match
2. Structural / Signal Pattern Match
3. Optional LLM Hypothesis
4. Rule Resolution

### 9.2 4a Geometry Match

LLM 미사용, 결정론적 처리.

입력:

- `parsed.json`
- `coarse_regions.json`
- `coord_map.json`

처리:

- region bbox와 `rects[].bbox_mm`, `sheets[].bbox_mm` IoU 비교
- nearby labels를 candidate names로 회수

출력:

- `geometry_matches.json`

### 9.3 4b Structural / Signal Pattern Match

LLM 미사용, 결정론적 처리.

초기 패턴 범위:

- `SPI_ISP_HEADER`
- `UART_HEADER`
- `I2C_BUS`
- `POWER_BLOCK`
- `MCU_CORE_CLUSTER`
- `PASSIVE_DECOUPLING_GROUP`
- `GENERIC_CONNECTOR_BLOCK`

출력:

- `pattern_matches.json`

### 9.4 4c Optional LLM Hypothesis

호출 조건:

- geometry high confidence 아님
- pattern top score가 설정값보다 낮음
- conflict 존재 또는 설명 부족

LLM이 하면 안 되는 것:

- 연결성 확정
- 최종 confidence 확정
- parser 사실 수정

출력:

- `llm_hypotheses.json`

### 9.5 4d Rule Resolution

입력:

- geometry match
- pattern match
- optional llm hypothesis
- cross-sheet resolution

우선순위:

1. explicit label + no contradiction
2. strong pattern score
3. pattern + llm agreement
4. cross-sheet confirmation boosts prior result
5. conflict -> `needs_review`
6. insufficient evidence -> `low`

출력:

- `interpretation_report.json`
- `interpretation_report.md`

## 10. Hierarchy Resolver

경로 제안: `src/lib/kicad-interpretation/hierarchy/`

### 10.1 목적

멀티시트 schematic을 재귀적으로 해석하여 상위 시트의 추론 정확도를 높인다.

### 10.2 처리

- `sheets[].sheet_file` 따라 재귀 parse
- sheet pin과 하위 실제 connector/symbol 구조 연결
- 상위 추론 confidence 보정

### 10.3 필수 기능

- visited set 기반 순환 참조 방지
- 상대 경로 / 절대 경로 해석
- sheet not found 시 warning 처리

## 11. 최종 출력

### 11.1 `interpretation_report.json`

필수 메타데이터:

- `source_file`
- `generated_at`
- `thresholds_version`
- `environment_check`
- `blocks[]`
- `review_needed[]`

### 11.2 `interpretation_report.md`

사람이 읽는 요약 리포트:

- 블록별 설명
- confidence
- 근거
- 검토 필요 항목

## 12. 평가 기준

### 12.1 골드셋 구성 원칙

개수보다 실패 유형 다양성을 우선한다.

필수 포함 유형:

- 명시 라벨형 박스
- 무라벨 커넥터형
- 멀티시트 커넥터형
- 전원부 묶음형
- 반복 채널형
- 커스텀 심볼형
- 사람이 엉성하게 배치한 회로형

### 12.2 핵심 지표

- block bbox IoU
- block_type accuracy
- role accuracy
- confidence calibration
- false confirmation rate
- review routing accuracy
- region dedup accuracy

가장 중요한 실패 지표는 `false confirmation rate`다.

## 13. 비기능 요구사항

- 동일 입력에 대해 Stage 1, 2, 2.5, 4a, 4b, 4d는 결정론적이어야 한다.
- Stage 3, 4c는 변동 가능하되 최종 판정 안정성이 유지되어야 한다.
- 일부 블록 실패가 전체 실패가 되면 안 된다.
- LLM/vision 호출 횟수 상한을 둘 수 있어야 한다.
- 중간 산출물 JSON은 모두 디버깅 가능해야 한다.
- 모든 임계값은 하드코딩이 아니라 `config/thresholds.json` 참조여야 한다.

### 13.1 Vision / LLM API 호출 정책

재시도 정책:

- 429, 5xx, timeout은 exponential backoff로 최대 3회 재시도
- 4xx는 재시도 없이 해당 region을 `needs_review`로 격리

타임아웃:

- coarse pass: 30초
- fine pass: 30초
- llm hypothesis: 20초

동시성 / rate limit:

- 기본 동시 호출 상한은 설정 가능
- 429 발생 시 동시 호출 수를 임시 절반으로 축소

비용 상한:

- budget 초과 시 남은 region은 `low` confidence + `budget_exhausted` evidence 부여

로깅:

- 모든 외부 호출은 `api_call_log.json`에 기록

## 14. 권장 기술 스택

- Parser: Python + `kiutils` 보강 또는 직접 s-expression 파서
- Renderer: `kicad-cli`
- Calibration: Python
- Vision: 멀티모달 비전 모델
- Matcher / Rules: Python
- LLM Hypothesis: 구조화 출력 강제 JSON schema
- 저장 방식: 파일 기반 JSON 캐시
- 의존성 환경: Dockerfile 또는 setup 스크립트에 KiCad CLI 설치 단계 명시

## 15. 구현 마일스톤

- `M0`: Parser
- `M1`: Renderer + dependency check + coordinate calibration
- `M2`: Geometry match + basic pattern match
- `M3`: Coarse/fine vision + crop expansion + dedup
- `M4`: Hierarchy resolver
- `M5`: Optional LLM hypothesis + rule resolution
- `M6`: Gold set evaluation + threshold retuning

## 16. 수용 기준

아래를 만족하면 1차 구현 수용 가능으로 본다.

- Parser가 sheet / rect / label / cross-sheet link를 안정적으로 추출한다.
- Renderer와 parser 좌표계가 검증 가능한 수준으로 정렬된다.
- explicit label 기반 block detection이 high confidence로 동작한다.
- 기본 connector / power / mcu / passive pattern 분류가 가능하다.
- LLM 없이도 일부 고신뢰 해석이 가능하다.
- 불확실한 항목은 `needs_review`로 보낸다.
- 최종 JSON / Markdown 리포트가 생성된다.
- `kicad-cli` 미설치 / 버전 불일치 시 명확한 에러로 즉시 중단된다.
- API 호출 일시 실패 1건이 전체 파이프라인을 중단시키지 않는다.
- 모든 임계값이 `config/thresholds.json`에서 로드된다.

## 17. 결론

본 명세는 회로 해석 문제를 `문자 기반 구조 해석`과 `이미지 기반 의도 해석`으로 분리하고, 이를 다시 결합하는 구현 기준을 정의한다.

핵심은 다음과 같다.

- 구조는 parser가 책임진다.
- 의도는 vision이 보조한다.
- 의미 가설은 LLM이 돕는다.
- 최종 판정은 rule engine이 수행한다.
- 모든 수치 기준은 운영 중 조정되는 파라미터다.
- 외부 의존성과 API 실패는 정상 운영 조건으로 처리해야 한다.
