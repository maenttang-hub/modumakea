# Component Catalog ETL

이 폴더는 대량 부품 카탈로그를 Supabase `components` 테이블로 밀어 넣기 전에 한 번 정규화하는 중간 단계입니다.

## 흐름

1. 외부 API/크롤러/LLM이 정규화한 부품 배열 JSON 확보
2. `catalog_to_supabase.py`로 JSONL 변환
3. Supabase `COPY` 또는 대시보드 import로 적재

현재 앱은 `components`를 우선 조회하고, 레거시 환경에서는 `components_master`도 fallback으로 읽습니다.

## 실행 예시

```bash
python3 scripts/component-catalog/catalog_to_supabase.py \
  scripts/component-catalog/examples/catalog-sample.json \
  --output /tmp/components.seed.jsonl
```

정적 코어 카탈로그와 기본 아두이노 라이브러리를 Supabase로 바로 밀어 넣을 때는 루트에서 아래 명령을 사용합니다.

```bash
npm run db:seed:dry
npm run db:bootstrap:sql
npm run db:seed
npm run db:seed:components:sql
```

한 번에 SQL Editor용 부트스트랩 파일이 필요하면 아래 산출물을 사용합니다.

- `scripts/component-catalog/generated/components.bootstrap.sql`
- `scripts/component-catalog/generated/full.bootstrap.sql`

`catalog_to_supabase.py`는 이제 `components`를 기본 대상으로 사용하며, 필요하면 레거시 `components_master`도 지정할 수 있습니다.

```bash
python3 scripts/component-catalog/catalog_to_supabase.py \
  scripts/component-catalog/examples/catalog-sample.json \
  --table components \
  --format sql \
  --output /tmp/components.import.sql
```

## 입력 규격

입력은 ModuMake `ComponentTemplate`에 가까운 정규화 배열이면 충분합니다.

```json
[
  {
    "id": "tpl_bme280",
    "name": "BME280 환경 센서",
    "category": "SENSOR",
    "description": "온도/습도/기압",
    "compatibleVoltage": "BOTH",
    "requiredPins": [
      { "name": "VCC", "allowedTypes": ["POWER"] },
      { "name": "GND", "allowedTypes": ["GND"] },
      { "name": "SDA", "allowedTypes": ["DIGITAL"] },
      { "name": "SCL", "allowedTypes": ["DIGITAL"] }
    ]
  }
]
```
