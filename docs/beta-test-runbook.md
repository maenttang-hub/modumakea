# Beta Test Runbook

작성일: 2026-06-30

## 베타 형태

- 대상: 5-10명 제한 베타
- 기간: 1-2주 단위
- 목표: 기능 홍보가 아니라 import 성공률, 경고 이해도, 오탐률, 리포트 공유 가능성 확인
- 제외: 공개 베타, 유료화, public cloud compile, 제조 가능 보증

## 참가자에게 줄 설명

ModuMake는 KiCad/간단 회로를 가져와서 전원, 배선, 핀, 부품 리스크를 검토하고 리포트로 정리하는 도구다.

ModuMake는 현재 full PCB CAD, 제조 가능 보증, 모든 부품 데이터시트 자동 검증, 전문 EDA 대체 도구가 아니다.

참가자는 공유 가능한 `.kicad_sch` 또는 `.kicad_pcb` 파일만 사용한다. 공식 KiCad DRC를 실행하면 선택한 `.kicad_pcb` 원문이 서버 임시 폴더로 전송되고, DRC 결과 생성 뒤 임시 파일은 삭제된다.

베타 초대 문구에는 다음을 포함한다.

- 테스트 목적: import 성공률, 경고 이해도, 오탐률, 리포트 공유 가능성 확인
- 지원 범위: KiCad import와 리뷰 리포트
- 제외 범위: 제조 가능 보증, 전문 EDA 대체, public cloud compile
- 데이터 처리: 기본 저장은 브라우저 로컬이며, 공식 KiCad DRC 실행 시 PCB 원문이 임시 전송됨
- 피드백 채널: `NEXT_PUBLIC_MODUMAKE_FEEDBACK_URL` 또는 `NEXT_PUBLIC_MODUMAKE_SUPPORT_EMAIL`로 설정된 채널

## 테스트 스크립트

1. `.kicad_sch` 또는 `.kicad_pcb` 파일을 올린다.
2. 회로 또는 PCB가 화면에 보이는지 확인한다.
3. validation panel에서 critical/warning/review 항목을 하나씩 클릭한다.
4. 각 경고에서 확실도, 근거 요약, 관측 사실, 확인 방법을 읽는다.
5. 실제로 해결한 항목은 `수정 완료`, 이미 설계에 반영된 항목은 `이미 반영됨`, 오탐은 `오탐 신고`로 표시한다.
6. 데이터시트로 확인한 항목은 `데이터시트 확인`을 켠다.
7. 리포트 페이지를 열고 PDF 또는 JSON으로 공유한다.
8. 실패했거나 이해가 안 된 항목은 파일 종류, 화면, 경고 제목을 피드백으로 남긴다.

## 피드백 양식

telemetry를 켜지 않는 제한 베타에서는 최소한 아래 항목을 수동으로 받는다.

```text
Tester:
Date:
File type: .kicad_sch / .kicad_pcb
Approx file size:
Import result: success / failed
Failure stage: file-read / parse / render / validation / report-export / unknown
Official KiCad DRC used: yes / no
Report exported: yes / no
Most confusing warning:
False-positive rule or title:
What should the product explain better:
Can this file be used for debugging: yes / no
```

## 운영자가 매일 확인할 것

- import 실패 top 5: stage, 확장자, 크기 구간
- false-positive top 5: rule id, severity, confidence, source bucket
- critical 이슈 중 근거가 부족한 항목
- report export까지 도달하지 못한 세션
- 피드백에서 반복되는 모호한 문구
- 공식 KiCad DRC 실패: KiCad CLI 없음, timeout, schematic parity fallback, invalid source

## 외부 샘플 기준

고정 샘플 50개는 회귀 기준선이고, 베타 품질 기준은 외부 사용자 파일로 따로 본다.

- 제한 베타 시작 전: 공유 허가가 있는 외부 파일 10개 이상
- 제한 베타 1주차 종료 전: 외부 파일 30개 이상
- 공개 베타 전: 외부 파일 50개 이상, import/render 결과와 반복 오탐 top 5 정리
- 파일은 저장하지 않는 것을 기본으로 하고, 디버깅에 쓸 파일은 명시적으로 허가를 받는다.

## 성공 기준

- 업로드 성공률 80% 이상
- import 성공 후 리포트 export율 40% 이상
- critical 오탐은 반복 패턴 0-1개 수준
- warning은 보수적이어도 확인 방법이 명확하다는 피드백
- 실패 시 사용자가 다음 행동을 이해함

## 종료 후 처리

- false-positive는 룰별로 `critical`, `warning`, `review`, `informational` 재분류
- generic/fallback 피드백은 mapper/catalog backlog로 분리
- import 실패는 parser bug, unsupported file, UX copy, data policy 문의로 분류
- 릴리즈별 테스트 결과는 `docs/beta-release-checklist.md` 형식으로 남긴다.
