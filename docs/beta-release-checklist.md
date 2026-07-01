# Beta Release Checklist

작성일: 2026-06-30

## 릴리즈 전 필수 확인

- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] `npm test`
- [ ] `npm run test:e2e`
- [ ] `npm run test:validation:baseline`
- [ ] `npm run test:validation:extended`
- [ ] `npm run product:preflight`
- [ ] `/api/health` returns `status: ok`
- [ ] `/launch-desk`가 기본 환경에서 404
- [ ] `/api/launch-desk`가 기본 환경에서 404
- [ ] public compile 관련 env가 false
- [ ] full surface query override 비활성
- [ ] WebSerial 비활성 또는 내부 검증 승인 확인
- [ ] beta event collection을 켤 경우 데이터 정책과 retention 확인
- [ ] `NEXT_PUBLIC_MODUMAKE_FEEDBACK_URL` 또는 `NEXT_PUBLIC_MODUMAKE_SUPPORT_EMAIL` 설정
- [ ] `/product-scope`, `/privacy`, `/support` 페이지 확인

## 릴리즈 기록 양식

```text
Release:
Date:
Commit:
Surface:
Build:
Lint:
Unit:
E2E:
Validation baseline:
Validation extended:
Known skips:
Import success rate:
Analysis completion rate:
Report export rate:
False-positive rate:
Top import failures:
Top issue feedback:
Rollback trigger:
```

## 중단 조건

- build 실패
- baseline validation 실패
- public compile 외부 노출
- Launch Desk 외부 노출
- critical false-positive 반복
- 사용자 파일/경로/원문이 로그에 남는 문제 발견
