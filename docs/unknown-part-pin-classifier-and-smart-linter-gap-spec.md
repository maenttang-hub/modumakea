# Unknown Part Pin Classifier & Smart Linter Gap Spec

이 문서는 현재 ModuMake의 주문 전 검수기에서

- 이미 구현된 것
- 아직 구현되지 않은 것
- 반드시 남아 있는 마지막 퍼즐

을 분리해서 정리한 실행 명세서입니다.

핵심 목표는 하나입니다.

> 매핑되지 않은 커스텀 KiCad 부품이 들어와도 검수가 멈추지 않게 만들고,
> 사용자가 5초 안에 핀 속성을 지정하면 전체 DRC/AI 검수가 즉시 다시 완주되게 한다.

---

## 1. 현재 상태 요약

### 이미 구현된 축

현재 코드베이스에는 아래 축이 이미 들어와 있습니다.

1. 회로망 기반 검수 엔진
   - `/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/drc-engine.ts`
   - `/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/circuit-netlist.ts`

2. 기본/확장 설계 감사
   - `/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/datasheet-rules.ts`

3. 최근 추가된 핵심 치명 규칙
   - 전원 소스 충돌
   - 부트 스트랩 핀 기본 상태 경고
   - 크리스털 로드 커패시터 누락
   - 레귤레이터 입력 전압 초과
   - NC 핀 연결 금지 위반

4. 우측 검증 패널과 리뷰 포커스 기반 시각 강조의 기반
   - `/Users/gimdong-il/Desktop/프로그램/modumake/src/components/dashboard/validation-panel.tsx`
   - `/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/review-focus.ts`

5. imported schematic용 KiCad 파싱 및 scene snapshot 경로
   - `/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/kicad-sch-parser.ts`
   - `/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/v3-kicad-parser/*`

### 아직 없는 축

하지만 아래 기능은 아직 없습니다.

1. 미등록 커스텀 부품 핀 속성 수동 지정 데이터 모델
2. 캔버스에서 핀 우클릭 후 `VCC / GND / SIGNAL / NC`를 주는 UI
3. 그 지정 결과를 메모리에 즉시 반영해 DRC를 재실행하는 경로
4. 같은 부품 재수입 시 재사용되는 핀 매핑 캐시
5. 검증 패널에서 “사용자 지정 핀 규칙 기반 검수”임을 표시하는 노출
6. 저장/재로드 후에도 이 수동 분류 결과가 유지되는 직렬화 규약
7. imported schematic와 일반 템플릿 부품이 섞인 프로젝트에서의 우선순위 규칙

즉, 엔진 규칙은 꽤 좋아졌지만, **모르는 부품을 유저가 직접 한 번 분류해 검수를 끝내는 마지막 사용자 루프**는 아직 없습니다.

---

## 2. 문제 정의

현재 검수 엔진은 다음 상황에서 막힙니다.

1. 사용자가 KiCad에서 직접 만든 커스텀 센서/보드/모듈을 import 한다.
2. 이 부품은 기존 템플릿 DB나 매핑 사전에 없다.
3. 따라서 어떤 핀이 전원인지, GND인지, 신호선인지, NC인지 확정되지 않는다.
4. 그러면 핀아웃 검사, 전원 충돌 검사, NC 검사, 부트 핀 검사, I2C 검사 같은 규칙이 보수적으로만 돌거나 아예 빠진다.

이 문제를 해결하려면 “없는 템플릿을 기다리지 않고, 사용자 분류를 임시 진실로 받아 검수를 완주하는 체계”가 필요합니다.

---

## 3. 범위

이번 단계의 범위는 아래까지입니다.

1. unknown imported part 감지
2. 핀 단위 속성 수동 지정
3. 메모리 반영
4. DRC 즉시 재실행
5. 프로젝트 저장 시 보존
6. 다음 import 또는 같은 부품 재사용 시 캐시 재적용
7. 검증 패널에 provenance 노출

이번 단계의 비범위는 아래입니다.

1. 자동 데이터시트 OCR
2. AI가 핀 역할을 100% 자동 추론해서 확정 저장
3. 커스텀 풋프린트 패드-핀 매핑 편집기 전체 완성
4. 제조용 BOM/MPN 카탈로그 동기화

---

## 4. 설계 원칙

### 4.1 Single Source of Truth

수동 분류 결과는 한 곳에서만 진실이어야 합니다.

- 런타임 검수
- UI 핀 렌더
- 저장/재로드
- AI 입력 빌더

모두 같은 구조를 봐야 합니다.

### 4.2 Imported Geometry First

unknown part의 핀 식별은 템플릿명이 아니라 imported pin anchor 기준으로 돌아야 합니다.

즉, 아래 정보가 기준입니다.

- `component.instanceId`
- `component.importedGeometry.pinAnchors[].pinId`
- `component.importedGeometry.pinAnchors[].label`
- `component.importedGeometry.pinAnchors[].number`

### 4.3 User Override Wins

사용자가 수동 지정한 핀 역할은

- 자동 매핑
- 휴리스틱 추정
- generic fallback

보다 항상 우선해야 합니다.

### 4.4 Reusable but Scoped

사용자 지정은 두 레벨로 저장합니다.

1. 프로젝트 내부 instance override
2. 재사용 가능한 library/footprint signature cache

instance override가 더 강합니다.

---

## 5. 데이터 모델 명세

### 5.1 새 타입 정의

파일:

- `/Users/gimdong-il/Desktop/프로그램/modumake/src/types/index.ts`

추가 타입:

```ts
export type UserDefinedPinRole =
  | 'POWER'
  | 'GND'
  | 'SIGNAL'
  | 'NC'
  | 'BOOT'
  | 'CLOCK'
  | 'ANALOG';

export interface UserDefinedImportedPinClass {
  pinKey: string;              // stable key, ex: "pin:PB0" or "num:14"
  pinId?: string;
  label?: string;
  number?: string;
  role: UserDefinedPinRole;
  railLabel?: string;          // optional: "3.3V", "5V", "VIN"
  note?: string;
  source: 'user';
  updatedAt: string;
}

export interface ImportedComponentPinClassOverride {
  instanceId: string;
  reference?: string;
  libraryId?: string;
  footprint?: string;
  classes: UserDefinedImportedPinClass[];
}

export interface ImportedPinClassCacheEntry {
  signature: string;           // stable reuse key
  libraryId?: string;
  footprint?: string;
  valuePattern?: string;
  classes: UserDefinedImportedPinClass[];
  createdAt: string;
  updatedAt: string;
}
```

### 5.2 프로젝트 문서에 저장할 필드

`ModuMakeProjectData`에 아래 필드 추가:

```ts
importedPinClassOverrides?: ImportedComponentPinClassOverride[];
importedPinClassCache?: ImportedPinClassCacheEntry[];
```

### 5.3 pinKey 생성 규칙

같은 부품 안에서 핀을 안정적으로 다시 찾기 위해 우선순위를 둡니다.

1. `pinId`가 있으면 `pin:${pinId}`
2. 없고 `number`가 있으면 `num:${number}`
3. 없고 `label`이 있으면 `label:${label}`

가능하면 `pinId + number + label`을 같이 저장하되, primary key는 위 우선순위로 만듭니다.

---

## 6. 재사용 시그니처 명세

unknown imported part를 다음에 다시 만났을 때 재사용할 서명(signature)은 아래 순서로 구성합니다.

```ts
signature = [
  importedMapping.libraryId ?? '',
  importedMapping.footprint ?? '',
  normalizedReferencePrefix ?? '',
  normalizedValue ?? '',
  stablePinSignature
].join('::')
```

`stablePinSignature`는 핀 목록의 정렬된 집합입니다.

예:

```ts
"PB0|14|PB0__VCC|7|VCC__GND|8|GND"
```

이 서명은 같은 라이브러리명만 믿지 않고, 실제 핀 구조까지 같이 보기 위한 장치입니다.

---

## 7. 런타임 적용 우선순위

검수 엔진이 핀 역할을 결정하는 우선순위는 아래입니다.

1. 프로젝트 instance override
2. 재사용 cache entry
3. imported pin label/name 기반 일반 추정
4. 템플릿/매핑 사전
5. unknown

즉, 유저가 한 번 직접 지정한 건 항상 최우선입니다.

---

## 8. UI 명세

### 8.1 핀 우클릭 메뉴

대상 파일:

- `/Users/gimdong-il/Desktop/프로그램/modumake/src/components/canvas/imported-schematic-node.tsx`
- 또는 scene-SVG 리뷰어 전환이 완료되면 overlay 기반 hit target

우클릭 가능한 대상:

- imported component의 pin anchor
- imported component의 pin text

컨텍스트 메뉴 항목:

1. `이 핀은 VCC`
2. `이 핀은 GND`
3. `이 핀은 신호선`
4. `이 핀은 NC`
5. `이 핀은 부트 핀`
6. `이 핀은 클럭 핀`
7. `이 핀은 아날로그 핀`
8. `지정 해제`

추가 하위 입력:

- VCC 선택 시 rail label:
  - `3.3V`
  - `5V`
  - `VIN`
  - `Custom`

### 8.2 unknown part 경고 배너

대상 파일:

- `/Users/gimdong-il/Desktop/프로그램/modumake/src/components/dashboard/validation-panel.tsx`

표시 조건:

- imported schematic 프로젝트
- unknown/unclassified pins 존재

문구 예시:

> 미등록 부품이 있어 일부 검수가 제한됩니다. 핀을 클릭해 전원/GND/신호선을 지정하면 즉시 전체 검수를 완료할 수 있습니다.

### 8.3 시각 표시

핀 라벨 지정 후 즉시 아래 표시를 추가합니다.

- `POWER`: amber badge
- `GND`: green badge
- `SIGNAL`: blue badge
- `NC`: gray badge
- `BOOT`: orange badge
- `CLOCK`: violet badge

단, 리뷰 화면을 과하게 시끄럽게 만들지 않도록

- 기본은 hover 때만
- 선택 시 고정 노출

로 제한합니다.

---

## 9. 상태 저장소 명세

대상 파일:

- `/Users/gimdong-il/Desktop/프로그램/modumake/src/store/project-document.ts`
- `/Users/gimdong-il/Desktop/프로그램/modumake/src/store/slices/*`

추가 액션:

```ts
setImportedPinClass(
  instanceId: string,
  pinKey: string,
  next: {
    role: UserDefinedPinRole;
    railLabel?: string;
    pinId?: string;
    label?: string;
    number?: string;
  }
): void;

clearImportedPinClass(instanceId: string, pinKey: string): void;

promoteImportedPinClassOverrideToCache(instanceId: string): void;
```

동작:

1. 유저가 우클릭 메뉴에서 역할을 고른다.
2. `importedPinClassOverrides`가 즉시 갱신된다.
3. 프로젝트 검수 selector가 다시 계산된다.
4. 검증 패널이 즉시 갱신된다.

---

## 10. DRC 엔진 연동 명세

대상 파일:

- `/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/drc-engine.ts`
- `/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/circuit-netlist.ts`
- `/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/imported-schematic-audit.ts`

### 10.1 엔진 입력 확장

`DrcEngineContext`에 아래 추가:

```ts
importedPinClassOverrides?: ImportedComponentPinClassOverride[];
importedPinClassCache?: ImportedPinClassCacheEntry[];
```

### 10.2 회로망 노드 전기 속성 오버라이드

`buildCircuitNodes(...)` 또는 equivalent layer에서 imported component pin을 만들 때

- user override가 있으면 그 역할로 electrical type을 덮어쓴다
- NC는 연결 금지 대상
- BOOT는 boot strap 검사 대상
- CLOCK는 crystal/oscillator 관련 규칙 대상

### 10.3 이번 단계에서 즉시 강화되는 기존 룰

아래 룰들이 수동 분류 결과를 직접 먹도록 바뀌어야 합니다.

1. `electrical.nc-pin-violation`
2. `mcu.boot-strap-audit`
3. `clock.crystal-load-cap-missing`
4. `power.source-collision`
5. `power.regulator-max-input`
6. `bus.i2c-pullup`
7. `bus.i2c-impedance-voltage`

### 10.4 새 보조 룰

아래 rule을 추가합니다.

```ts
ruleId: 'imported.pin-role-classification-missing'
```

의미:

- unknown imported part에 아직 분류되지 않은 핵심 핀이 남아 있음
- 전체 검수가 아예 멈추지는 않지만 정확도가 제한됨

추천 문구:

> 이 부품의 핀 역할이 아직 완전히 분류되지 않아 일부 전기 검사는 보수적으로만 수행되었습니다.

---

## 11. 저장/재로드 명세

대상 파일:

- `/Users/gimdong-il/Desktop/프로그램/modumake/src/store/project-document.ts`
- `/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/ensure-imported-validation-snapshot.ts`

요구 사항:

1. 로컬 저장
2. 클라우드 저장
3. serialize -> hydrate roundtrip

에서 모두 아래가 유지되어야 합니다.

- importedPinClassOverrides
- importedPinClassCache

검증 포인트:

- 새로고침 후에도 수동 지정 핀 역할이 유지됨
- 같은 프로젝트에서 검수 결과가 동일하게 재생성됨
- 캐시가 있으면 같은 부품 재import 시 바로 분류 적용됨

---

## 12. AI / validation 패널 노출 명세

대상 파일:

- `/Users/gimdong-il/Desktop/프로그램/modumake/src/components/dashboard/validation-panel.tsx`
- `/Users/gimdong-il/Desktop/프로그램/modumake/src/components/dashboard/validation-ai-section.tsx`
- `/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/build-lightweight-validation-json.ts`

### 12.1 provenance 노출

검수 패널에 아래 배지를 표시합니다.

1. `Native KiCad`
2. `Template matched`
3. `User pin classified`
4. `Fallback heuristic`

이건 “이 검수 결과가 어디서 온 진실인지”를 보여주는 장치입니다.

### 12.2 AI 입력 포함 항목

Lightweight validation JSON에 아래 요약을 추가합니다.

```json
{
  "user_pin_classification": {
    "classified_component_count": 2,
    "classified_pin_count": 7,
    "unclassified_component_refs": ["U7", "J3"]
  }
}
```

AI가 “왜 일부 판단이 보수적인지”를 알 수 있게 하기 위함입니다.

---

## 13. 테스트 명세

### 13.1 단위 테스트

파일:

- `/Users/gimdong-il/Desktop/프로그램/modumake/tests/drc-engine.test.ts`
- `/Users/gimdong-il/Desktop/프로그램/modumake/tests/circuit-netlist.test.ts`
- `/Users/gimdong-il/Desktop/프로그램/modumake/tests/project-serialization.test.ts`

필수 케이스:

1. unknown imported part의 NC 핀을 사용자 지정 후 NC 위반이 잡힘
2. GPIO0를 `BOOT`로 지정하고 bias 저항이 없으면 boot strap warning 발생
3. 같은 부품을 다시 import 하면 cached classification이 자동 재적용됨
4. 저장 -> 재로드 후 classification 유지
5. user override가 heuristic보다 우선함

### 13.2 UI 테스트

필수 시나리오:

1. 핀 우클릭 메뉴 오픈
2. 역할 지정 후 badge 반영
3. 검수 패널 issue count 즉시 갱신
4. “사용자 지정 핀 규칙 기반 검수” 배지 노출

### 13.3 회귀 테스트

아래 기존 fixture들은 계속 유지합니다.

- Arduino_hat
- rasphat_proj2
- Flamingo p
- MATRIX PROJECT
- P_supply
- ZF8HP Transmission_8HPTCUAdapter
- frequency-divider_frequency-divider
- GDI-STM_boost

목적:

- unknown pin classifier 추가가 기존 KiCad exact-ish 렌더/검수 경로를 깨지 않게 보장

---

## 14. 구현 순서

### Phase A - 데이터와 엔진

1. 타입 추가
2. store 직렬화 필드 추가
3. DRC context 입력 확장
4. user override -> netlist node classification 반영
5. classification missing rule 추가

### Phase B - UI

1. imported pin hit target 정의
2. 우클릭 메뉴 추가
3. 핀 역할 badge 노출
4. validation panel 배너/배지 노출

### Phase C - 재사용

1. cache signature 생성
2. 같은 부품 재import 시 자동 적용
3. 프로젝트 저장/재로드 roundtrip 테스트 추가

### Phase D - AI/검수 연결

1. lightweight validation JSON에 provenance 추가
2. AI 패널에서 user classified 상태 설명
3. 검수 결과 정렬 우선순위 조정

---

## 15. 완료 정의

아래가 되면 이 단계는 완료입니다.

1. unknown imported part가 있어도 검수가 멈추지 않는다
2. 유저가 핀 몇 개만 지정하면 즉시 치명 규칙이 다시 계산된다
3. 저장/재로드 후 분류 정보가 유지된다
4. 같은 커스텀 부품을 다시 import 하면 자동 재사용된다
5. 검증 패널이 “어떤 결과가 사용자 분류 기반인지” 명확히 보여준다

---

## 16. 지금 기준으로 아직 안 한 것 체크리스트

- [ ] `ImportedComponentPinClassOverride` 타입 추가
- [ ] `ImportedPinClassCacheEntry` 타입 추가
- [ ] project document 저장 필드 추가
- [ ] imported pin 우클릭 메뉴 추가
- [ ] 핀 역할 지정 store action 추가
- [ ] 지정 직후 DRC 재실행 연결
- [ ] netlist node 분류 override 연결
- [ ] unknown pin classification missing rule 추가
- [ ] validation panel provenance 배지 추가
- [ ] lightweight validation JSON provenance 확장
- [ ] 동일 부품 재사용 cache 적용
- [ ] serialize/hydrate roundtrip 테스트 추가
- [ ] UI interaction 테스트 추가

---

## 17. 한 줄 결론

지금 엔진은 이미 꽤 좋은 검문소가 되었지만,
**커스텀 부품에서도 검수를 끝까지 밀어붙이게 만드는 마지막 퍼즐은 “미지 부품 핀 분류기”**입니다.

이 기능이 들어가면 템플릿 DB 공백 때문에 검수가 멈추는 문제가 사실상 사라지고,
ModuMake는 “모르는 부품이 섞여도 주문 전 5분 안에 끝까지 점검 가능한 검수기”에 훨씬 가까워집니다.
