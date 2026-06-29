# Supabase Seed Guide

이 문서는 ModuMake의 기본 카탈로그를 Supabase에 실제로 올리는 마지막 한 걸음을 정리한 실행 가이드입니다.

지금 기준으로 앱은:

- `public.components` 테이블을 먼저 조회하고
- 없으면 정적 번들 카탈로그로 fallback 하며
- `public.arduino_libraries`가 준비되면 라이브러리 검색형 UI도 바로 열 수 있습니다.

## 1. 스키마 적용

Supabase SQL Editor에서 아래 파일을 먼저 실행합니다.

- [/Users/gimdong-il/Desktop/프로그램/modumake/docs/supabase_schema.sql](/Users/gimdong-il/Desktop/프로그램/modumake/docs/supabase_schema.sql)

이 파일은 다음을 만듭니다.

- `public.components`
- `public.arduino_libraries`
- 검색용 인덱스
- 공개 읽기용 RLS 정책

## 2. 환경 변수 준비

`.env.local` 또는 현재 셸 환경에 아래 값을 넣습니다.

```bash
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

`SUPABASE_SERVICE_ROLE_KEY`가 있어야 실제 upsert가 됩니다. 없으면 dry-run 또는 SQL 파일 생성만 가능합니다.

## 3. 미리보기 생성

먼저 시드 JSON과 import SQL을 로컬에서 생성합니다.

```bash
npm run db:seed:dry
```

생성 결과:

- [/Users/gimdong-il/Desktop/프로그램/modumake/scripts/component-catalog/generated/components.seed.json](/Users/gimdong-il/Desktop/프로그램/modumake/scripts/component-catalog/generated/components.seed.json)
- [/Users/gimdong-il/Desktop/프로그램/modumake/scripts/component-catalog/generated/components.import.sql](/Users/gimdong-il/Desktop/프로그램/modumake/scripts/component-catalog/generated/components.import.sql)
- [/Users/gimdong-il/Desktop/프로그램/modumake/scripts/component-catalog/generated/arduino-libraries.seed.json](/Users/gimdong-il/Desktop/프로그램/modumake/scripts/component-catalog/generated/arduino-libraries.seed.json)
- [/Users/gimdong-il/Desktop/프로그램/modumake/scripts/component-catalog/generated/arduino-libraries.import.sql](/Users/gimdong-il/Desktop/프로그램/modumake/scripts/component-catalog/generated/arduino-libraries.import.sql)

## 4. 스키마 + 코어 카탈로그를 한 번에 묶은 SQL 만들기

Supabase SQL Editor에 한 번에 붙여 넣고 싶다면 아래 명령을 사용합니다.

```bash
npm run db:bootstrap:sql
```

생성 결과:

- [/Users/gimdong-il/Desktop/프로그램/modumake/scripts/component-catalog/generated/components.bootstrap.sql](/Users/gimdong-il/Desktop/프로그램/modumake/scripts/component-catalog/generated/components.bootstrap.sql)
- [/Users/gimdong-il/Desktop/프로그램/modumake/scripts/component-catalog/generated/full.bootstrap.sql](/Users/gimdong-il/Desktop/프로그램/modumake/scripts/component-catalog/generated/full.bootstrap.sql)

권장 사용:

- `components.bootstrap.sql`: 스키마 + 기본 부품 카탈로그만 넣을 때
- `full.bootstrap.sql`: 스키마 + 기본 부품 + 기본 아두이노 라이브러리까지 한 번에 넣을 때

## 5. 직접 업서트 실행

서비스 롤 키가 준비되어 있다면 아래 명령으로 Supabase에 바로 적재할 수 있습니다.

```bash
npm run db:seed
```

특정 대상만 넣고 싶을 때:

```bash
npm run db:seed -- --target components
npm run db:seed -- --target arduino_libraries
```

## 6. 확인 쿼리

Supabase SQL Editor에서 아래 쿼리로 적재 상태를 바로 확인할 수 있습니다.

```sql
select count(*) as components_count from public.components;
select count(*) as libraries_count from public.arduino_libraries;

select id, name, category
from public.components
order by name
limit 20;

select name, author, latest_version
from public.arduino_libraries
order by name
limit 20;
```

## 7. 앱에서 확인할 것

로컬 앱을 다시 열면:

- 좌측 부품 라이브러리의 source가 `Cloud catalog`로 보이는지
- `/api/components` 검색이 Supabase 결과를 우선 쓰는지
- 라이브러리 검색이 `public.arduino_libraries`를 읽는지

이 세 가지만 보면 됩니다.

## 메모

- 현재 앱은 Supabase가 비어 있거나 설정이 빠져 있어도 정적 번들 카탈로그로 fallback 합니다.
- 그래서 먼저 SQL만 넣어두고, 나중에 서비스 키를 붙여도 안전합니다.
