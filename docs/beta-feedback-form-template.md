# Beta Feedback Form Template

작성일: 2026-07-01

이 문서는 제한 베타에서 Google Form, Tally, Typeform, Notion form 중 아무 도구에나 그대로 옮겨 넣기 위한 피드백 양식이다. telemetry를 켜지 않는 동안에는 이 양식이 사실상 품질 측정 기준이다.

## Form Title

ModuMake 제한 베타 피드백

## Intro Copy

ModuMake는 KiCad 회로도와 PCB 파일을 가져와 전원, 배선, 핀, 부품 리스크를 검토하고 리포트로 정리하는 베타 도구입니다.

공유 가능한 파일만 테스트해 주세요. PCB 화면에서 공식 KiCad DRC를 실행하면 선택한 `.kicad_pcb` 원문이 서버 임시 폴더로 전송되고, DRC 결과 생성 뒤 임시 파일은 삭제됩니다.

## Required Questions

```text
1. 이름 또는 별칭
Short answer

2. 연락 가능한 이메일
Short answer

3. 사용한 파일 종류
Multiple choice
- .kicad_sch
- .kicad_pcb
- 둘 다
- 기타

4. 파일 크기
Multiple choice
- 100KB 미만
- 100KB-1MB
- 1MB-5MB
- 5MB 이상
- 모름

5. 파일을 불러온 결과
Multiple choice
- 정상적으로 열림
- 열렸지만 화면이 이상함
- 열렸지만 너무 작거나 읽기 어려움
- 멈춘 것처럼 보임
- 실패 메시지가 나옴
- 기타

6. 문제가 있었다면 어느 단계였나요?
Checkboxes
- 파일 선택/업로드
- 회로도 렌더링
- PCB 렌더링
- 검토 결과/경고
- 공식 KiCad DRC
- 리포트 보기/내보내기
- 잘 모르겠음

7. 가장 헷갈렸던 경고 또는 문구
Paragraph

8. 실제 설계 기준으로 틀렸다고 느낀 경고가 있었나요?
Paragraph

9. 화면에서 가장 불편했던 점
Paragraph

10. 기대했던 결과와 실제 결과가 어떻게 달랐나요?
Paragraph

11. 화면 캡처 또는 짧은 설명을 첨부할 수 있나요?
File upload or paragraph

12. 이 파일을 디버깅/회귀 테스트에 사용해도 되나요?
Multiple choice
- 예, 파일을 공유해도 됩니다
- 아니요, 화면 캡처와 설명만 사용해 주세요
- 별도로 문의해 주세요

13. 공개 사례나 데모에 사용해도 되나요?
Multiple choice
- 아니요
- 이름/프로젝트명을 가리면 가능합니다
- 별도로 문의해 주세요
```

## Operator Tags

피드백을 받은 뒤 운영자가 수동으로 붙일 태그다.

```text
import.success
import.failure
render.schematic.small-text
render.schematic.clipped
render.pcb.dense
render.pcb.layer-confusing
drc.official-failed
warning.false-positive
warning.unclear
report.export-failed
privacy.question
corpus.allowed
corpus.not-allowed
```

## Daily Summary Format

```text
Date:
Tester count:
Files tested:
.kicad_sch success:
.kicad_pcb success:
Top import failure:
Top render issue:
Top confusing warning:
False-positive candidates:
Files allowed for corpus:
Must-fix before next invite:
```

## Stop Conditions

- 같은 파일 종류에서 import 실패가 2명 이상 반복된다.
- 사용자가 파일이 저장되는지 불안하다고 반복해서 묻는다.
- critical 경고 오탐이 같은 rule id로 2회 이상 나온다.
- 공식 KiCad DRC 실행 실패가 2회 이상 반복된다.
- 화면이 너무 작거나 빽빽하다는 피드백이 3회 이상 반복된다.
