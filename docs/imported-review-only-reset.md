# Imported Review-Only Reset

이 문서는 imported KiCad schematic 화면에서 에디터 기능을 다시 섞지 않기 위한 현재 원칙을 고정합니다.

## 목표

imported schematic 화면은 **에디터가 아니라 리뷰어**입니다.

남겨둘 것:

- KiCad 회로도 불러오기
- 도면 보기
- 자동 검증 보기
- 댓글/주석 남기기
- 저장 / 공유
- 화면 맞춤
- 다크 / 화이트 테마 전환

제거하거나 숨길 것:

- 편집 모드 전환
- 부품 라이브러리 런처
- 자동 배선 / 배치 툴바
- ModuMake 전용 편집 워크플로
- 격자 / 미니맵 / 편집 보조 액션을 전면에 드러내는 메뉴
- imported schematic 화면에서의 에디터성 AI 상태 노출

## 적용 원칙

### 1. Shell Mode

imported schematic에서는 shell mode를 항상 `review`로 강제합니다.

### 2. Left Panel

좌측 패널은 부품 라이브러리가 아니라 **도면 리뷰 패널**로 사용합니다.

- 도면 통계
- 리뷰 흐름
- 레거시 저장본 재가져오기 안내

### 3. Header

imported schematic에서는 헤더에서 아래를 제거합니다.

- `편집` 토글
- 부품 라이브러리 버튼
- 에디터성 AI 상태 배지

대신 `리뷰 전용` 상태를 명시합니다.

### 4. Canvas

imported schematic에서는 플로팅 편집 툴바를 띄우지 않습니다.

### 5. Context Menu

imported schematic의 우클릭 메뉴는 아래만 허용합니다.

- 주석 달기
- 화면 맞춤
- 검증 / 댓글 / 속성 열기

편집 보조 기능은 넣지 않습니다.

## 다음 단계

1. imported schematic의 저장 후 재로드 경로에서 wire / junction / label 좌표를 계속 추적
2. MCU / connector / power symbol에서 원본 KiCad primitive 우선 비율을 더 높임
3. scene-SVG 기반 단일 렌더 축으로 완전히 수렴
