# Imported KiCad Clean-Room Rearchitecture

이 문서는 현재 imported KiCad 회로도 경로를 **부분 수리**가 아니라 **구조 리셋** 관점에서 다시 정의합니다.

핵심 판단은 간단합니다.

> 지금의 imported schematic 경로는  
> **에디터 모델**, **장면 렌더러**, **검증 모델**, **저장 복구 로직**이 서로 짬뽕되어 있어서  
> 버그를 하나 잡을수록 다른 축이 다시 흔들리는 상태입니다.

따라서 앞으로는 “기존 축을 조금씩 고치는 방식”이 아니라,

**KiCad scene 기반 리뷰어**와  
**v3 검증 파이프라인**

이 두 축만 남기는 방향으로 재설계합니다.

---

## 1. 문제 정의

현재 오류가 반복되는 이유는 구현이 부족해서만이 아닙니다.

더 근본적으로는 서로 성격이 다른 네 가지가 한 경로 안에 같이 들어가 있기 때문입니다.

1. **화면에 보이는 KiCad 회로도**
2. **React Flow 기반 앱 에디터 노드**
3. **검증/AI용 논리 연결 모델**
4. **클라우드 저장/복구용 스냅샷**

이 네 가지가 서로의 역할을 침범하면서 아래 문제가 반복됩니다.

- wires는 저장돼 있는데 화면에 안 보임
- 심볼은 보이는데 핀과 선이 안 맞음
- 텍스트가 회전/반전/겹침
- 클라우드 저장 후 다시 열면 좌표가 틀어짐
- fallback 심볼과 원본 primitive가 섞여서 앱처럼 보임
- 검증용 데이터와 실제 화면 데이터가 서로 다른 상태를 봄

한 줄로 줄이면:

**지금은 “한 소스에서 두 결과를 만들자”가 아니라  
“여러 중간 모델이 서로를 대신하려고 드는 구조”가 문제입니다.**

---

## 2. 리셋 원칙

앞으로 imported KiCad 경로는 아래 두 개의 산출물만 허용합니다.

### A. Visual Scene Snapshot

역할:

- 화면에 그대로 그릴 데이터

포함 내용:

- symbol primitives
- pin stems
- pin text
- reference/value text
- wire segments
- junctions
- labels
- sheet frames
- page frame

중요:

- 이 데이터는 **절대 scene 좌표** 기준입니다.
- 렌더 시점에 node-local 보정 수학을 하지 않습니다.

### B. Logical Validation Model

역할:

- 검증, AI, HW/SW 정합성 분석용 데이터

포함 내용:

- nets
- components
- pins
- labels
- unresolved symbols
- code pin usage merge 대상

중요:

- 이 데이터는 **화면 복원 책임이 없습니다**.
- 오직 검증과 AI 입력만 담당합니다.

---

## 3. 최종 아키텍처

```text
[.kicad_sch source]
        │
        ▼
  [S-expression parse]
        │
        ├──────────────────────────────┐
        ▼                              ▼
[Visual Scene Builder]          [v3 Logical Builder]
        │                              │
        ▼                              ▼
[Scene Snapshot]                [Logical Validation Model]
        │                              │
        ▼                              ▼
[Single Scene SVG Renderer]     [DRC / ERC / AI / Reports]
        │
        ▼
[Lightweight Interaction Layer]
```

이 구조의 의미는 분명합니다.

- **화면은 scene snapshot이 책임진다**
- **검증은 v3 logical model이 책임진다**
- **React Flow는 viewport와 interaction shell만 담당한다**

---

## 4. 무엇을 버릴 것인가

이 문서에서 가장 중요한 부분입니다.

다음은 앞으로 imported KiCad 경로의 메인 축이 아닙니다.

### 4.1 imported node가 심볼 몸체를 그리는 방식

파일:

- [src/components/canvas/imported-schematic-node.tsx](/Users/gimdong-il/Desktop/프로그램/modumake/src/components/canvas/imported-schematic-node.tsx)

이 파일은 앞으로:

- hover
- selection
- context menu
- comment target

만 담당해야 합니다.

즉, “심볼 본체를 그리는 컴포넌트”가 아니라  
“투명한 interaction carrier”가 되어야 합니다.

### 4.2 저장된 component bounds를 기준으로 심볼을 다시 구성하는 흐름

이 흐름은 계속 좌표 drift를 만들 가능성이 큽니다.

앞으로는:

- scene snapshot에 절대좌표로 들어 있는 심볼을 그대로 그린다
- component node는 그 위에 interaction만 얹는다

가 기본 원칙입니다.

### 4.3 fallback를 기본 경로로 두는 방식

원본 KiCad primitive가 있으면,

- rect
- polyline
- circle
- arc
- text

를 그대로 우선 사용해야 합니다.

fallback은:

- symbol resolution 실패
- primitive 데이터 진짜 없음
- 레거시 저장본에서 원본 scene 유실

같은 경우에만 마지막 수단으로 허용합니다.

---

## 5. 무엇을 살릴 것인가

기존 코드 중에도 버릴 필요 없는 좋은 축은 있습니다.

### 5.1 v3 validation parser

문서:

- [v3-kicad-validation-pipeline.md](/Users/gimdong-il/Desktop/프로그램/modumake/docs/v3-kicad-validation-pipeline.md)

코드:

- [src/lib/parse-kicad-for-validation.ts](/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/parse-kicad-for-validation.ts)
- [src/lib/v3-kicad-parser/](/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/v3-kicad-parser/)

이건 계속 메인입니다.

이 경로는:

- validation
- AI analyze input
- lightweight validation JSON
- integrated validation snapshot

의 단일 진실 원천으로 유지합니다.

### 5.2 scene-first visual renderer

파일:

- [src/components/canvas/imported-schematic-overlay.tsx](/Users/gimdong-il/Desktop/프로그램/modumake/src/components/canvas/imported-schematic-overlay.tsx)

이 파일이 imported review 시각 경로의 주인이 되어야 합니다.

### 5.3 source-first recovery

저장 후 재로드할 때도:

1. importedSchematicSource가 있으면 원본으로 다시 scene 생성
2. source가 없을 때만 stored scene snapshot 사용

이 우선순위를 고정합니다.

---

## 6. 경계선: 렌더 축 vs 검증 축

앞으로는 둘을 절대 섞지 않습니다.

### 렌더 축

책임:

- KiCad처럼 보이기
- 좌표 흔들림 없이 보이기
- 저장 후 다시 열어도 같은 그림 보이기

데이터:

- scene snapshot

### 검증 축

책임:

- DRC / ERC
- HW/SW consistency
- AI analyze
- report generation

데이터:

- logical validation model

중요:

검증 축은 화면을 복구하지 않습니다.  
렌더 축은 net 추론을 책임지지 않습니다.

---

## 7. 실제 파일 기준 목표 상태

### 7.1 `kicad-sch-parser.ts`

역할:

- scene snapshot builder

해야 할 일:

- 모든 symbol instance를 absolute scene coordinates로 전개
- original primitive 최대 보존
- text orientation/upright 처리
- wire/junction/label/frame 절대좌표화

하면 안 되는 일:

- editor-friendly node state를 주 출력으로 삼기

### 7.2 `imported-schematic-overlay.tsx`

역할:

- imported review visual engine

해야 할 일:

- scene.symbols
- scene.wires
- scene.junctions
- scene.labels
- scene.frames

를 한 SVG에서 렌더링

하면 안 되는 일:

- component node local math에 의존하기

### 7.3 `imported-schematic-node.tsx`

역할:

- interaction-only hitbox

해야 할 일:

- hover outline
- selected outline
- comment anchor
- context selection

하면 안 되는 일:

- body primitives 주 렌더링
- pin text 렌더링 주도
- fallback symbol body 주도

### 7.4 `canvas-graph.ts`

역할:

- scene node + interaction node 조립

해야 할 일:

- overlay scene node를 기본 visual node로 넣기
- component nodes는 interaction carrier로 유지

하면 안 되는 일:

- overlay와 component가 둘 다 같은 심볼 몸체를 주도적으로 그리게 두기

---

## 8. 단계별 재설계 순서

### Phase 0. Freeze

먼저 해야 할 일:

- imported schematic 경로에 새 임시 fallback 추가 중단
- node-local 렌더 보정 추가 중단
- “조금만 더 조건문” 식 수리 중단

이걸 안 멈추면 계속 짬뽕이 커집니다.

### Phase 1. Scene Snapshot 완성

목표:

- source -> scene snapshot만으로 KiCad 회로도 전체 형상 출력 가능

완료 기준:

- component nodes가 아무것도 안 그려도 회로도가 보임

### Phase 2. Node Demotion

목표:

- imported node는 interaction-only

완료 기준:

- 부품 클릭, 주석, 하이라이트는 되지만
- visible symbol body는 scene만 그림

### Phase 3. Reload Stability

목표:

- cloud save/load 뒤에도 same scene

완료 기준:

- wires / labels / junctions / symbols 위치 불변

### Phase 4. Fidelity Pass

목표:

- MCU / connector / power / sensor symbol을 KiCad쪽으로 더 붙이기

완료 기준:

- fallback 비율 최소화
- text anchor/baseline/rotation KiCad parity 개선

---

## 9. Acceptance Criteria

### 9.1 Zero Drift

빠르게 pan/zoom해도:

- wires
- pins
- labels
- symbol bodies

사이 결합이 흔들리지 않아야 합니다.

### 9.2 Reload Repeatability

저장 -> 재로드를 반복해도 최초 import와 같은 그림이어야 합니다.

### 9.3 Simpler Code Ownership

코드베이스에서 imported review 시각 책임이

- overlay
- node
- repair math
- fallback body renderer

에 분산되지 않아야 합니다.

### 9.4 Review UX Preservation

다음은 그대로 유지해야 합니다.

- hover
- select
- context menu
- comment placement
- validation focus

---

## 10. 최종 선언

앞으로 imported KiCad 회로도는

**반쯤 editor로 변환된 회로도**

가 아니라

**KiCad scene 기반 리뷰어**

로 다룹니다.

이 선언이 중요한 이유는,

이제부터는 버그를 고칠 때마다

“이걸 node에서 보정할까?”

가 아니라

“이건 scene가 책임질 일인가, validation이 책임질 일인가?”

로 판단할 수 있기 때문입니다.

그게 결국 지금의 짬뽕 구조를 끝내는 가장 현실적인 방법입니다.

