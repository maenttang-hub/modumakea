# Beta Backlog Checklist

기준선:
- 지금은 판정 일관성
- 베타 전에는 하드코딩 제거
- 베타 후에는 대형 파일 분해

## 즉시 수정 3개

- [x] 전원 alias 정규화 추가: `+12V / 12V / 3V3 / 3.3V / VCC / VDD`
- [x] `getBoardSignalLimits` 중복 제거 후 공통 유틸 1곳으로 통합
- [x] `build-integrated-validation-json.ts`의 컴포넌트 단위 `netLabels` 집계를 핀 단위 기준으로 축소하거나 제거

## 베타 전 수정 3개

- [ ] `inferRegulatorMaxInputVoltage`를 코드 하드코딩에서 `part_master` 데이터 기반으로 이전
- [ ] `getTemplateElectricalProfile`를 코드 하드코딩에서 카탈로그/DB 기반으로 이전
- [ ] `inferPinoutVariantDetail`의 브랜드/보드 정규식을 JSON 또는 설정 테이블로 분리 시작

## 공개 운영 전 보안/운영 게이트

- [ ] AI 요청 제한을 단일 인스턴스 메모리 Map에서 Supabase/Redis 같은 공유 저장소 기반으로 이전
- [ ] compile 사용량 제한을 단일 인스턴스 메모리 Map에서 Supabase/Redis 같은 공유 저장소 기반으로 이전
- [ ] production 환경에서는 메모리 전용 limiter가 활성화되지 않는지 preflight 또는 테스트로 검증

## 베타 후 리팩토링 3개

- [ ] `circuit-netlist.ts`는 새 도메인 경계가 생길 때만 `ADC / op-amp / power / sensor-front-end` 단위로 분리
- [ ] `drc-engine.ts`는 새 rule 추가 규칙이 정착된 뒤 `power / reset-clock / interface / protection / analog` 단위로 분리
- [ ] `kicad-sch-parser.ts`는 fixture 회귀 테스트가 충분히 쌓인 뒤 연결 복원, 심볼 매핑, scene 생성 로직을 모듈별로 분리

## 대형 핵심 파일 변경 규칙

- 새 validation rule은 `rule id`, `confidence`, `evidenceSummary`, `observedFacts`, `howToVerify`, regression test 없이 추가하지 않는다.
- 기존 parser/connectivity 동작을 바꾸면 최소 하나의 KiCad fixture 또는 focused unit test를 같이 추가한다.
- 단순 정리 목적의 파일 분해는 베타 후로 미룬다. 베타 전에는 새 도메인 추가처럼 변경 경계가 명확한 경우만 별도 모듈로 뺀다.

## 한 줄 우선순위

- 지금: 판정 일관성
- 베타 전: 하드코딩 제거
- 공개 운영 전: 공유 저장소 기반 rate limit
- 베타 후: 대형 파일 분해
