# KiCad 해석 엔진 코드 해석 및 재설계안

기준 명세서: [kicad-interpretation-engine-spec.md](/Users/gimdong-il/Desktop/프로그램/modumake/docs/kicad-interpretation-engine-spec.md)

## 0. 목적

이 문서는 현재 저장소의 KiCad 관련 코드를 해석하고, 새 `문자 파싱 + 이미지 인식 매칭` 해석 엔진을 어디서부터 다시 시작해야 하는지 결정하기 위한 재설계 기준을 고정한다.

## 1. 현재 코드 해석 요약

현재 저장소의 KiCad 관련 코드는 크게 세 축으로 나뉜다.

### 1.1 레거시 importer 축

중심 파일:

- [src/lib/kicad-sch-parser.ts](/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/kicad-sch-parser.ts)

역할:

- `.kicad_sch`를 기존 ModuMake 캔버스/프로젝트 문서 모델로 변환
- imported schematic scene 생성
- 리뷰 화면에서 보이는 primitive/scene 재구성

문제:

- 해석 엔진보다 UI/캔버스 호환이 우선인 구조다
- 파일이 너무 크고 책임이 많다
- 새 엔진의 stage 분리와 맞지 않는다

판정:

- 유지하되 새 해석 엔진의 기반으로는 사용하지 않는다
- 레거시 호환 경로로 격리한다

### 1.2 v3 validation parser 축

중심 파일:

- [src/lib/v3-kicad-parser/index.ts](/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/v3-kicad-parser/index.ts)
- [src/lib/v3-kicad-parser/build-schematic-domain-model.ts](/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/v3-kicad-parser/build-schematic-domain-model.ts)
- [src/lib/parse-kicad-for-validation.ts](/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/parse-kicad-for-validation.ts)
- [src/types/schematic-domain.ts](/Users/gimdong-il/Desktop/프로그램/modumake/src/types/schematic-domain.ts)

역할:

- KiCad schematic을 검증 지향 도메인 모델로 파싱
- 심볼/핀/라벨/와이어/시트 구조 추출
- logical net 계산
- lightweight validation / unified circuit model 직렬화

강점:

- 구조적 진실을 분리해서 다루고 있다
- 레거시 importer보다 훨씬 새 엔진 방향에 가깝다
- 테스트 자산과 연결돼 있다

문제:

- 새 명세서 기준의 `parsed.json` 계약과 1:1 대응하지 않는다
- rect, nearby labels, crop용 bbox 인덱스, cross-sheet link 표현이 아직 부족하다
- 이미지 인식과 매칭될 별도 interpretation contract가 없다

판정:

- 새 해석 엔진의 parser 커널로 재사용한다
- 그러나 직접 노출하지 않고 adapter layer를 둔다

### 1.3 UI / scene render 축

중심 파일:

- [src/lib/imported-schematic-render.ts](/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/imported-schematic-render.ts)
- [src/lib/export-schematic-image.ts](/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/export-schematic-image.ts)

역할:

- imported schematic 리뷰 화면용 primitive/scene 표시
- DOM 기반 이미지 export

문제:

- KiCad CLI 기반 해석 파이프라인 렌더러와 목적이 다르다
- 브라우저 렌더 기준이라 parser 좌표와 strict하게 맞춘다는 보장이 없다

판정:

- 새 엔진의 renderer로 재사용하지 않는다
- UI 계층에 남긴다

## 2. 무엇을 살리고 무엇을 분리할 것인가

### 2.1 그대로 살릴 것

- `v3-kicad-parser`의 AST 파싱 축
- symbol / wire / label / sheet 추출 로직
- logical net 계산기
- 실프로젝트 회귀 테스트 자산

### 2.2 adapter로 감쌀 것

- `SchematicDomainModel`
- `parseKiCadForValidation`
- existing connectivity solver

이유:

- 새 해석 엔진의 JSON 계약과 직접 결합시키지 않기 위해
- 기존 validation 파이프라인과 독립적으로 진화시키기 위해

### 2.3 분리만 하고 유지할 것

- `kicad-sch-parser.ts`
- imported scene reconstruction
- 브라우저 기반 schematic image export

이유:

- 현재 제품 UI가 여전히 사용 중일 가능성이 높음
- 새 해석 엔진과 섞을수록 경계가 다시 흐려짐

## 3. 재설계 핵심 결정

### 3.1 새 엔진은 새 폴더에서 시작

새 엔진 코드는 아래 경로에서 시작한다.

- `src/lib/kicad-interpretation/`

이 폴더는 다음 책임만 가진다.

- parser adapter
- thresholds/config loader
- pipeline stage contracts
- stage orchestration entrypoints

### 3.2 parser는 "교체"가 아니라 "승격 + adapter"

지금부터 구조적 진실은 `v3-kicad-parser`가 담당한다.  
하지만 새 엔진은 그 결과를 바로 쓰지 않고, 새 계약으로 변환한 `parsed.json` 형태를 표준으로 삼는다.

즉:

- `v3 parser` = 내부 커널
- `interpretation parser adapter` = 외부 계약 변환기

### 3.3 renderer는 clean-room으로 분리

새 렌더러는 브라우저 DOM export가 아니라:

- `kicad-cli` 의존성 검증
- full render
- crop render
- coord map

만 책임진다.

현재 UI용 render 유틸은 여기에 연결하지 않는다.

### 3.4 matcher와 rule engine은 완전 신규

현재 코드베이스에는 새 명세 기준의:

- coarse region
- fine region
- geometry match
- pattern match
- llm hypothesis
- rule resolution

계약이 없다.

따라서 이 부분은 신규로 시작한다.

## 4. 다시 시작할 때의 구현 경계

다음은 새 엔진이 처음부터 가져야 하는 최소 파일 집합이다.

- `src/lib/kicad-interpretation/index.ts`
- `src/lib/kicad-interpretation/contracts.ts`
- `src/lib/kicad-interpretation/thresholds.ts`
- `src/lib/kicad-interpretation/pipeline.ts`
- `src/lib/kicad-interpretation/parser/adapter.ts`

초기에는 구현보다 경계가 중요하다.

## 5. 지금 당장 하지 않을 것

- 레거시 importer를 새 명세에 맞춰 억지로 확장
- 브라우저 렌더 export를 새 엔진 렌더러로 전용
- UI 흐름과 해석 엔진을 동시에 개편
- LLM 호출부터 먼저 붙이기

## 6. 첫 재시작 순서

1. 새 엔진 폴더와 계약 추가
2. thresholds loader와 stage context 추가
3. `v3 parser -> parsed contract` adapter 추가
4. 레거시 경로와 새 경로를 문서상/코드상 분리
5. 이후 renderer와 calibration 구현 시작

## 7. 결론

현재 저장소는 완전히 빈 상태가 아니다.  
새 엔진의 진짜 출발점은 `kicad-sch-parser.ts`가 아니라 `v3-kicad-parser`다.

따라서 재설계의 핵심은:

- 좋은 코어는 살리고
- 경계를 다시 세우고
- 새 해석 엔진을 독립 모듈로 시작하는 것

이다.
