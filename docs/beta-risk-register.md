# Beta Risk Register

작성일: 2026-06-30

목적: 제한 베타에서 예상되는 실패를 먼저 정의하고, 감으로 대응하지 않기 위한 운영 기준이다.

## 범위

베타에서 ModuMake는 아래 한 문장으로만 설명한다.

> KiCad/간단 회로를 가져와서 전원, 배선, 핀, 부품 리스크를 검토하고 리포트로 정리하는 도구

아래 표현은 사용하지 않는다.

- full PCB CAD
- 제조 가능 보증
- public cloud compile
- 모든 부품 데이터시트 자동 검증
- 전문 EDA 대체

## 예상 문제와 대응

| 위험 | 사용자가 보는 증상 | 감지 방법 | 완화책 | 베타 중단 기준 |
| --- | --- | --- | --- | --- |
| KiCad import 실패 | 파일을 올렸지만 화면에 회로가 안 뜸 | `import_failed` 이벤트, 실패 stage, 확장자, 크기 구간 | 실패 toast에 복구 안내 표시, 파일 종류/크기/사유 집계 | 업로드 성공률 80% 미만 |
| critical 오탐 | 위험하지 않은 회로를 빨간 경고로 표시 | `false-positive` 피드백, 베타 인터뷰 | critical 룰은 근거 없으면 warning/review로 낮춤 | critical 오탐이 2건 이상 반복 |
| generic/fallback 숨김 | 왜 보수적으로 판단했는지 모름 | low-confidence import 표시, issue 클릭률 | source bucket, mapping confidence, 확인 방법 노출 | 사용자가 판단 근거를 설명하지 못함 |
| 리포트 공유 실패 | 리뷰는 했지만 전달물이 없음 | `report_exported` 이벤트 | report view/PDF/JSON export 유지, 실패 시 fallback JSON export | 리포트 export율 40% 미만 |
| 보류 기능 노출 | Launch Desk/compile/full CAD가 보임 | env audit, route 404 확인 | `review-mvp` surface, Launch Desk/compile default off | public compile 또는 Launch Desk 외부 노출 |
| 데이터 신뢰 우려 | 파일이 서버에 저장되는지 불명확 | 피드백 폼, support 문의 | beta data policy 표시, telemetry는 파일명/원문 제외 | 사용자가 데이터 처리에 동의하지 못함 |
| 운영 추적 불가 | 실패 재현이 어려움 | request id 로그 부재 | `/api/beta/events` request id, release test log | 실패 원인을 3건 이상 재현 못함 |

## 측정 지표

- 업로드 성공률: `import_succeeded / import_attempt`
- 분석 완료율: 업로드 성공 후 validation panel issue 계산 완료 비율
- 리포트 export율: `report_exported / import_succeeded`
- 이슈 클릭률: validation focus 이벤트 또는 패널 상호작용
- false-positive 신고율: `issue_feedback_updated` 중 `false-positive`
- 재방문율: 같은 익명 설치/브라우저 기준 7일 내 재사용

## 베타 지속 기준

- `npm run build`, `npm run test:validation:baseline` 실패 없음
- public compile, Launch Desk, full surface 기본 비활성
- critical 오탐은 발견 즉시 triage
- 사용자가 개발자 도움 없이 import, issue 확인, feedback 처리, report export까지 완료
