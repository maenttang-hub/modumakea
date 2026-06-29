# DRC Audit Reality Check

이 문서는 현재 ModuMake의 설계 검증 엔진과 KiCad 리뷰어 경로를 실제 코드 기준으로 다시 분류한 메모다.

분류 기준:

- `실제 구현`: 코드 경로와 핵심 로직이 현재 저장소에 존재함
- `부분 구현`: 핵심 뼈대는 있으나 정확도, 범위, UI 연결, 데이터 품질이 아직 부족함
- `아직 없음`: 명세/아이디어는 있으나 현재 코드 기준으로는 부재

## 1. 실제 구현

| 항목 | 상태 | 근거 |
| --- | --- | --- |
| 핵심 DRC 룰 레지스트리 | 실제 구현 | [`src/lib/drc-engine.ts`](/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/drc-engine.ts:44) |
| 전원 소스 충돌 검사 | 실제 구현 | [`src/lib/drc-engine.ts`](/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/drc-engine.ts:247) |
| NC 핀 오연결 검사 | 실제 구현 | [`src/lib/drc-engine.ts`](/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/drc-engine.ts:286) |
| 크리스털 로드 커패시터 누락 검사 | 실제 구현 | [`src/lib/drc-engine.ts`](/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/drc-engine.ts:330) |
| 레귤레이터 최대 입력 전압 초과 검사 | 실제 구현 | [`src/lib/drc-engine.ts`](/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/drc-engine.ts:368) |
| MCU 부트 스트래핑 핀 바이어스 검사 | 실제 구현 | [`src/lib/drc-engine.ts`](/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/drc-engine.ts:428) |
| 직접 전원/GND 쇼트 및 전압 레일 충돌 검사 | 실제 구현 | [`src/lib/circuit-netlist.ts`](/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/circuit-netlist.ts:503) |
| 저임피던스 합선 경로 추적 | 실제 구현 | [`src/lib/circuit-netlist.ts`](/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/circuit-netlist.ts:675) |
| 넷 기반 I2C 풀업/합성 임피던스/전압 도메인 검사 | 실제 구현 | [`src/lib/circuit-netlist.ts`](/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/circuit-netlist.ts:855) |
| 핀아웃 불일치 검사 | 실제 구현 | [`src/lib/circuit-netlist.ts`](/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/circuit-netlist.ts:1190) |
| 다이오드 전압 방향성 점검 | 실제 구현 | [`src/lib/circuit-netlist.ts`](/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/circuit-netlist.ts:1304) |
| LED 전류 제한 누락/과소 전류 검사 | 실제 구현 | [`src/lib/circuit-netlist.ts`](/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/circuit-netlist.ts:1368) |
| 이슈별 visual target 메타데이터 | 실제 구현 | [`src/types/index.ts`](/Users/gimdong-il/Desktop/프로그램/modumake/src/types/index.ts:582), [`src/lib/circuit-netlist.ts`](/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/circuit-netlist.ts:724) |
| 검증 패널 포커싱/하이라이트 | 실제 구현 | [`src/components/dashboard/validation-panel.tsx`](/Users/gimdong-il/Desktop/프로그램/modumake/src/components/dashboard/validation-panel.tsx:644) |
| Ghost fix preview / commit / rollback 저장소 | 실제 구현 | [`src/store/slices/fix-preview-slice.ts`](/Users/gimdong-il/Desktop/프로그램/modumake/src/store/slices/fix-preview-slice.ts:181) |
| 풋프린트 매처 뷰어 컴포넌트 | 실제 구현 | [`src/components/dashboard/footprint-matcher-viewer.tsx`](/Users/gimdong-il/Desktop/프로그램/modumake/src/components/dashboard/footprint-matcher-viewer.tsx:42) |

## 2. 부분 구현

| 항목 | 상태 | 왜 부분 구현인지 | 근거 |
| --- | --- | --- | --- |
| datasheet-rules 기반 I2C 점검 | 부분 구현 | 실제 넷 연결 추적이 아니라 부품 수/저항 수 기반 추정 로직이 섞여 있음 | [`src/lib/datasheet-rules.ts`](/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/datasheet-rules.ts:1720), [`src/lib/datasheet-rules.ts`](/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/datasheet-rules.ts:1842) |
| 핀아웃 검사 범위 | 부분 구현 | diode/BJT/MOSFET/regulator/driver/opamp는 있으나 범용 패키지군 자동 일반화는 아직 부족함 | [`src/lib/circuit-netlist.ts`](/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/circuit-netlist.ts:1012), [`src/lib/circuit-netlist.ts`](/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/circuit-netlist.ts:1124) |
| KiCad imported 텍스트 정렬 충실도 | 부분 구현 | native anchor/baseline 일부 반영은 있지만, 여전히 큰 폭의 휴리스틱 오프셋이 남아 있음 | [`src/lib/kicad-sch-parser.ts`](/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/kicad-sch-parser.ts:1886), [`src/lib/kicad-sch-parser.ts`](/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/kicad-sch-parser.ts:2097), [`src/lib/kicad-sch-parser.ts`](/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/kicad-sch-parser.ts:2265) |
| Auto-fix UX | 부분 구현 | store 레벨 preview/commit은 있으나 모든 검증 카드에 일관되게 붙은 단계는 아님 | [`src/store/slices/fix-preview-slice.ts`](/Users/gimdong-il/Desktop/프로그램/modumake/src/store/slices/fix-preview-slice.ts:181), [`src/components/dashboard/validation-panel.tsx`](/Users/gimdong-il/Desktop/프로그램/modumake/src/components/dashboard/validation-panel.tsx:768) |
| 핀 리맵/풋프린트 매칭 편집 흐름 | 부분 구현 | 뷰어와 일부 매핑 기반은 있으나, 광범위한 드래그-투-리맵 저장 모델로 일반화됐다고 보긴 이름 | [`src/components/dashboard/footprint-matcher-viewer.tsx`](/Users/gimdong-il/Desktop/프로그램/modumake/src/components/dashboard/footprint-matcher-viewer.tsx:42) |
| imported schematic 리뷰어의 KiCad 1:1 시각 재현 | 부분 구현 | primitive 기반 복원은 많이 왔지만 다이오드 방향, connector baseline, power/GND 배치 같은 마감 이슈가 남아 있음 | [`src/lib/kicad-sch-parser.ts`](/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/kicad-sch-parser.ts:2360) |

## 3. 아직 없음

| 항목 | 상태 | 비고 |
| --- | --- | --- |
| 미지 부품 핀 분류기 | 아직 없음 | 사용자 지정 VCC/GND/Signal 분류를 즉시 DRC에 반영하는 흐름 없음 |
| 사용자 지정 핀 규칙 기반 검수 배지 | 아직 없음 | 패널에 “사용자 지정 규칙이 개입했다”는 명시적 표시 없음 |
| 재사용 가능한 부품군 단위 핀 매핑 캐시 | 아직 없음 | 비슷한 부품에 자동 제안하는 학습형 캐시 부재 |
| 저항 wattage / 커패시터 voltage derating 룰 | 아직 없음 | 현재 감사 보고서 지적이 맞음 |
| KiCad parser 전용 Web Worker | 아직 없음 | 메인 스레드 동기 파싱 구조 |
| 전원/발열 게이지의 완결된 실시간 UI | 아직 없음 | 일부 룰은 있으나 대시보드형 계산/게이지 마감은 부재 |

## 4. 감사 보고서 해석 보정

### 맞게 짚은 부분

- 텍스트/primitive 충실도는 아직 마감 전 단계다.
- parser 성능은 아직 worker 분리가 필요하다.
- derating 류 규칙은 아직 없다.
- unknown-part classifier는 아직 없다.

### 보정이 필요한 부분

- `datasheet-rules.ts`의 I2C 점검을 “완전 구현”으로 쓰면 과장이다.
  - 정확한 넷 기반 I2C 검사는 `circuit-netlist.ts`에 있다.
  - `datasheet-rules.ts`는 아직 추정형 보강 레이어에 가깝다.
- 핀아웃 검사를 “정적 템플릿 수준”으로만 보면 현재보다 낮은 평가다.
  - imported 핀 역할/이름 힌트를 쓰는 일반화가 이미 일부 들어가 있다.

## 5. 우선순위

### P0 — 지금 제일 먼저

1. **KiCad 화면 충실도 마감**
   - 이유: 지금 사용자 신뢰를 가장 크게 깎는 건 검증 엔진 부재보다 “보이는 회로가 KiCad와 다르다”는 문제다.
   - 범위:
     - P_supply 다이오드 방향
     - Arduino_hat 전원/GNDPWR/AREF/RESET 텍스트
     - MATRIX Q1~Q8, 배터리 잭 스위치 배선/primitive
     - connector baseline/핀 이름 겹침
   - 관련 파일:
     - [`src/lib/kicad-sch-parser.ts`](/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/kicad-sch-parser.ts:1886)

2. **텍스트 배치 휴리스틱 축소, native justify 우선화**
   - 이유: 현재 시각 오차의 대부분이 여기서 나온다.
   - 범위:
     - pin/property text의 native 좌표/justify 보존 확대
     - 역할별 하드코딩 오프셋 축소

### P1 — 그다음 바로

3. **미지 부품 핀 분류기**
   - 이유: 검증 엔진이 좋은데도 커스텀 부품에서 막히면 실사용성이 크게 떨어진다.
   - 범위:
     - 데이터 모델
     - 우클릭 핀 속성 지정
     - 메모리 반영 후 DRC 재실행
     - 검증 패널 배지

4. **재사용 가능한 핀 매핑 캐시**
   - 이유: 같은 계열 부품 반복 작업을 줄여준다.
   - 범위:
     - footprint/pin remap 결과를 부품군 단위로 저장
     - 다음 유사 부품에 자동 제안

### P2 — 안정화/확장

5. **parser worker 분리**
   - 이유: 대형 KiCad 파일 UX 개선
   - 범위:
     - S-expression parse
     - scene build 백그라운드 처리

6. **derating, thermal/power gauge 마감**
   - 이유: 검수기 완성도를 올리지만, 지금의 가장 큰 사용자 체감 문제는 아님

## 6. 한 줄 결론

현재 ModuMake는 “검증 엔진이 텅 빈 상태”는 아니다.
오히려 논리 코어는 이미 꽤 들어와 있다.

지금 가장 우선순위가 높은 것은:

1. **KiCad처럼 정확히 보이게 만드는 시각 충실도 마감**
2. **커스텀/미지 부품에서도 검수가 막히지 않게 만드는 분류기**
3. **그 다음 성능과 고급 규칙 확장**
