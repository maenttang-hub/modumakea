# KiCad 회로 해석 엔진 실제 작업 순서표

기준 문서: [kicad-interpretation-engine-spec.md](/Users/gimdong-il/Desktop/프로그램/modumake/docs/kicad-interpretation-engine-spec.md)

## 0. 목표

이 순서표는 구현팀이 바로 착수할 수 있도록, 선후관계와 검증 포인트를 포함한 실제 작업 흐름을 정의한다.

## 1. Phase A — 기반 고정

### A1. 산출물 디렉터리와 설정 뼈대 만들기

- `docs/` 아래 명세 문서 유지
- `schemas/interpretation-engine/` 아래 JSON schema 초안 배치
- `config/thresholds.json` 추가
- 출력 산출물 디렉터리 규칙 정의

완료 기준:

- 문서, 스키마, 설정 파일이 저장소에 존재
- threshold 파일을 읽는 공통 loader 인터페이스 정의

### A2. 공통 타입 정의

- parsed model type
- coarse/fine vision result type
- geometry/pattern/llm/rule output type
- interpretation report type

완료 기준:

- 타입 파일에서 최종 산출물 구조를 참조 가능
- JSON schema와 타입이 크게 충돌하지 않음

## 2. Phase B — Parser 선구현

### B1. Stage 1 parser 최소 버전

- `.kicad_sch` 읽기
- symbol / wire / label / junction / text 추출
- bbox 계산

검증:

- 작은 fixture 3개에서 `parsed.json` 생성

### B2. sheet / rect / hierarchy 보강

- sheet 객체 추출
- sheet pin 추출
- rect 추출
- `contained_entities`
- `nearby_labels`
- `cross_sheet_links`

검증:

- 멀티시트 fixture에서 시트 구조 재현
- `Arduino_hat` 계열에서 sheet/rect 누락 여부 수동 확인

### B3. parse index 생성

- entity by id
- entities by bbox grid
- labels by text
- sheet links by signal

검증:

- region lookup helper가 인덱스를 실제 사용 가능

## 3. Phase C — Renderer와 좌표 정합성

### C1. 환경 검증

- `kicad-cli` 존재 확인
- 버전 확인
- `sch export svg` 지원 확인
- `environment_check.json` 생성

검증:

- 미설치 환경에서 명확한 실패 메시지
- 지원 환경에서 정상 통과

### C2. full render 생성

- `render_full.svg`
- `render_full.png`
- `coord_map.json`

검증:

- 동일 입력 반복 실행 시 동일 크기/기준점 유지

### C3. coordinate calibration

- anchor 추출
- 평균/최대 오차 계산
- `coord_validation.json` 생성

검증:

- 기준 fixture에서 오차가 threshold 이내
- threshold 초과 시 vision 차단 로직 동작

## 4. Phase D — Matcher의 결정론적 절반 먼저

### D1. geometry match

- region 없이도 rect/sheet 기준 후보 구조 구성 가능하게 유틸 구축
- IoU 매칭 구현
- nearby label 회수 구현

검증:

- 명시 라벨형 박스를 high confidence로 잡음

### D2. pattern match

초기 패턴만 지원:

- `SPI_ISP_HEADER`
- `UART_HEADER`
- `I2C_BUS`
- `POWER_BLOCK`
- `MCU_CORE_CLUSTER`
- `PASSIVE_DECOUPLING_GROUP`
- `GENERIC_CONNECTOR_BLOCK`

검증:

- 패턴 점수와 top candidate를 구조적으로 설명 가능

## 5. Phase E — Vision 연결

### E1. coarse pass 인터페이스

- `render_full.png` 입력
- `coarse_regions.json` 출력
- structured tags 중심 응답 파서 구현

검증:

- region 0개 / 1개 / 다수 케이스 처리

### E2. region dedup

- IoU 병합
- containment suppress
- sub-candidate 보존
- `dedup_log` 생성

검증:

- 중복 region이 줄어들고 병합 로그가 남음

### E3. structural crop expansion

- px -> mm 역변환
- entity intersect 조회
- bbox union + margin
- symbol 절단 방지 재시도
- high-res crop 렌더

검증:

- crop에 반쪽 심볼이 최소화됨

### E4. fine pass

- crop 이미지와 entity 목록 동시 입력
- `fine_regions.json` 저장
- skip 조건 적용

검증:

- high confidence region은 fine pass를 생략
- low/ambiguous region은 fine pass 수행

## 6. Phase F — Hierarchy와 LLM 보조

### F1. hierarchy resolver

- 하위 시트 재귀 parse
- visited set 순환 방지
- 상위 결과 confidence boost

검증:

- 하위 시트에서 실제 connector/symbol이 발견되면 상위 추론이 보강됨

### F2. optional llm hypothesis

- 호출 조건 게이트 구현
- 구조화 출력 파싱
- hypothesis validation

검증:

- LLM이 없어도 파이프라인 기본 동작
- LLM 결과가 parser 사실을 덮어쓰지 않음

### F3. rule resolution

- explicit label
- strong pattern
- pattern + llm agreement
- conflict -> `needs_review`
- budget exhausted 구분

검증:

- 최종 `interpretation_report.json` 생성

## 7. Phase G — 운영성, 평가, 회귀

### G1. API 정책 적용

- retry
- timeout
- concurrency limit
- backpressure
- `api_call_log.json`

### G2. gold set 구축

필수 유형:

- 명시 라벨형
- 무라벨 커넥터형
- 멀티시트형
- 전원부형
- 반복 채널형
- 커스텀 심볼형
- 엉성한 배치형

### G3. 지표 측정

- bbox IoU
- `block_type` accuracy
- `role` accuracy
- confidence calibration
- false confirmation rate
- review routing accuracy
- region dedup accuracy

### G4. threshold 재조정

- `config/thresholds.json` 값 조정
- 변경 이력 기록
- 평가 결과와 같이 보관

## 8. 첫 구현 권장 순서

실제 착수 우선순위는 아래와 같다.

1. `config/thresholds.json` + schema 파일 배치
2. Parser 최소 버전
3. sheet / rect / hierarchy 보강
4. Renderer + environment check
5. Coordinate calibration
6. Geometry match
7. Basic pattern match
8. Coarse vision
9. Region dedup
10. Structural crop expansion
11. Fine vision
12. Hierarchy resolver
13. Optional LLM hypothesis
14. Rule resolution
15. Gold set 평가

## 9. 구현 중 절대 놓치면 안 되는 것

- 좌표 정합성 실패 상태에서 vision 결과를 신뢰하지 말 것
- parser 사실을 LLM 결과로 수정하지 말 것
- threshold를 코드에 박아 넣지 말 것
- 멀티시트 처리를 나중으로 미루더라도 schema에는 처음부터 포함할 것
- `needs_review`를 실패가 아니라 정상 출력 경로로 취급할 것
