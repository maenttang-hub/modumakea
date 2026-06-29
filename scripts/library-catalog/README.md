# Arduino Library Index Seeder

이 폴더는 Arduino 공식 `library_index.json` 같은 대량 라이브러리 인덱스를 ModuMake의 `arduino_libraries` 테이블로 옮기는 경로입니다.

## 지원 흐름

1. 로컬에 `library_index.json` 준비
2. seed JSON + import SQL 생성
3. 필요하면 Supabase에 바로 upsert

## 실행 예시

```bash
npm run libraries:seed:index -- --input /path/to/library_index.json --dry-run
```

실행 결과:

- `scripts/library-catalog/generated/arduino-library-index.seed.json`
- `scripts/library-catalog/generated/arduino-library-index.import.sql`

## 참고

- 인덱스 안에 헤더 정보가 비어 있으면 라이브러리 이름으로부터 대표 헤더 후보를 추정합니다.
- 실제 Supabase 업서트는 `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`가 필요합니다.
