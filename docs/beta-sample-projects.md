# Beta Sample Projects

작성일: 2026-06-30

목적: 첫 사용자와 베타 운영자가 같은 기준으로 "좋은 결과", "보수적 결과", "해석 실패"를 확인하게 한다.

## 1. 좋은 결과

파일:

- `examples/blink-uno.modumake.json`
- `examples/blink-uno.ino`

기대:

- 단순 LED/저항 흐름이 열린다.
- report export까지 막히지 않는다.
- 심각 경고가 없거나 설명 가능한 낮은 수준의 review만 나온다.

## 2. 보수적 결과

파일:

- `examples/monaco-review-focus.modumake.json`

기대:

- 입력 핀/버튼 코드처럼 해석이 필요한 항목이 review로 남는다.
- 사용자는 issue card에서 근거와 확인 방법을 읽고 `이미 반영됨` 또는 `수정 완료`로 처리한다.
- 반복 검토 시 처리한 항목은 숨김 또는 톤 다운된다.

## 3. 해석 실패 예시

파일:

- `examples/rc-filter-notes.md`
- 또는 zip/PDF/image처럼 KiCad 원본이 아닌 파일

기대:

- import가 조용히 실패하지 않는다.
- 사용자는 `.kicad_sch` 또는 `.kicad_pcb` 원본이 필요하다는 안내를 본다.
- 운영자는 파일명 없이 확장자, 크기 구간, 실패 stage만 수집할 수 있다.

## KiCad 베타 샘플 후보

로컬에 `tests/kicad_samples/`가 있는 환경에서는 아래 세트를 먼저 본다.

- `tests/kicad_samples/rusefi/A4988_stepper_motor_driver/Motor_driver_A4988.kicad_sch`
- `tests/kicad_samples/rusefi/tle9104-breakout/tle9104-breakout.kicad_sch`
- `tests/kicad_samples/rusefi/mini48-stm32/mini48-stm32.kicad_sch`

이 파일들은 repo fresh clone의 필수 자산으로 취급하지 않는다. 베타 사용자에게 배포할 샘플은 라이선스와 재배포 가능성을 따로 확인해야 한다.
