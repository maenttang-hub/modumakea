# Beta Backlog Checklist

기준선:
- 지금은 판정 일관성
- 베타 전에는 하드코딩 제거
- 베타 후에는 대형 파일 분해

## 즉시 수정 3개

- [ ] 전원 alias 정규화 추가: `+12V / 12V / 3V3 / 3.3V / VCC / VDD`
- [ ] `getBoardSignalLimits` 중복 제거 후 공통 유틸 1곳으로 통합
- [ ] `build-integrated-validation-json.ts`의 컴포넌트 단위 `netLabels` 집계를 핀 단위 기준으로 축소하거나 제거

## 베타 전 수정 3개

- [ ] `inferRegulatorMaxInputVoltage`를 코드 하드코딩에서 `part_master` 데이터 기반으로 이전
- [ ] `getTemplateElectricalProfile`를 코드 하드코딩에서 카탈로그/DB 기반으로 이전
- [ ] `inferPinoutVariantDetail`의 브랜드/보드 정규식을 JSON 또는 설정 테이블로 분리 시작

## 베타 후 리팩토링 3개

- [ ] `circuit-netlist.ts`를 `ADC / op-amp / power / sensor-front-end` 단위로 분리
- [ ] `drc-engine.ts`를 `power / reset-clock / interface / protection / analog` 단위로 분리
- [ ] `kicad-sch-parser.ts`에서 연결 복원, 심볼 매핑, scene 생성 로직을 모듈별로 분리

## 한 줄 우선순위

- 지금: 판정 일관성
- 베타 전: 하드코딩 제거
- 베타 후: 대형 파일 분해
