# Review MVP Scope

작성일: 2026-06-30

## 목적

ModuMake의 기본 제품 표면은 full PCB CAD가 아니라 review-first 하드웨어 검토 도구다. 이 문서는 기본 MVP에서 노출할 기능과 보류할 기능을 고정해 범위 확장을 통제한다.

## 기본 사용자

- Arduino, ESP32, Raspberry Pi 스타일 프로젝트를 만드는 초보자/메이커
- KiCad 회로도를 갖고 있지만 전원, 배선, 센서 연결 리스크를 빠르게 확인하고 싶은 사용자
- 교육/워크숍에서 제출 전 회로 검토가 필요한 사용자

## 기본 MVP에 노출하는 기능

- KiCad schematic import
- 간단한 schematic workspace
- 회로/전원/핀/데이터시트 기반 validation panel
- confidence, source bucket, fallback/generic 여부 표시
- report page 및 PDF export
- browser-local project persistence
- starter firmware/code review flow

## 기본 MVP에서 보류하는 기능

- full PCB authoring
- manufacturing release gate
- public cloud compile
- 자동 PCB 생산 파일 생성 보증
- Launch Desk
- 모든 부품을 정확히 이해하는 범용 데이터시트 검증

## 보류 기능 처리 기준

- `review-mvp` 표면에서 보이지 않는 기능은 내부 실험 또는 운영 비활성 기능으로 취급한다.
- 보류 기능이 빌드, 테스트, 보안 정책을 깨면 해당 기능보다 안정화 작업을 우선한다.
- public cloud compile은 인증, 쿼터, 로그 보존, artifact 만료, sandbox 격리가 검증되기 전까지 공개 기능으로 취급하지 않는다.
- PCB 관련 문구는 "검토 보조"로 표현하고, 제조 가능 보증으로 표현하지 않는다.

## 변경 기준

MVP 노출 기능을 늘리려면 아래 조건을 먼저 만족해야 한다.

- `npm run lint` 통과
- `npm run build` 통과
- `npm test` 통과
- `npm run test:e2e` 통과
- 새 기능의 대표 regression test 추가
- README와 이 문서의 범위 설명 업데이트
