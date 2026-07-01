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
- [ ] `/api/launch-desk` POST가 기본 환경에서 404
- [ ] 배포 서버에서 `kicad-cli --version` 또는 `KICAD_CLI_PATH` 확인
- [ ] public compile 관련 env가 false
- [ ] full surface query override 비활성
- [ ] WebSerial 비활성 또는 내부 검증 승인 확인
- [ ] beta event collection을 켤 경우 데이터 정책과 retention 확인
- [ ] `NEXT_PUBLIC_MODUMAKE_FEEDBACK_URL` 또는 `NEXT_PUBLIC_MODUMAKE_SUPPORT_EMAIL` 설정
- [ ] `/product-scope`, `/privacy`, `/support` 페이지 확인
- [ ] 베타 초대/테스트 안내에 공식 KiCad DRC 임시 업로드 문구 포함
- [ ] 공유 허가가 있는 외부 사용자 KiCad 파일 10개 이상 확보

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
Official KiCad DRC:
External file count:
Feedback channel:
Rollback trigger:
```

## 중단 조건

- build 실패
- baseline validation 실패
- 배포 서버에서 KiCad CLI 실행 불가
- public compile 외부 노출
- Launch Desk 외부 노출
- critical false-positive 반복
- 사용자 파일/경로/원문이 로그에 남는 문제 발견
