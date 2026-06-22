@AGENTS.md

# 공사 사진대장 (6-19-picture-cctv-deploy)

CCTV 설치 등 공사 현장의 **사진대장**을 작성·저장·인쇄(PDF)하는 단일 페이지 웹앱.
현장에서 휴대폰으로 사진을 올리고, 같은 링크를 다른 기기에서 열어 이어 작업하고, A4로 인쇄/PDF 출력한다.

## 스택 · 배포
- **Next.js 16.2.9 (Turbopack), App Router** — ⚠️ `AGENTS.md` 경고대로 학습된 Next.js와 다름. 코드 작성 전 `node_modules/next/dist/docs/` 해당 가이드 확인.
- 클라이언트 전용(`'use client'`), 서버 라우트 없음. 거의 전부 `src/app/page.tsx` 한 파일(약 800줄).
- **Supabase**: 공유 인스턴스 `pvhntshaadmbmpskwqmg` (anon 키, `.env.local`의 `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
- **Repo**: `git@github.com:sungki1972/6-19-picture-cctv-deploy.git` (SSH, main 브랜치).
- **Production**: https://6-19-picture-cctv-deploy.vercel.app (`.vercel/` 연결됨 → `vercel --prod --yes`로 배포. push만으로는 자동배포 안 됨 — CLI 또는 대시보드 import).
- 빌드/검증: `npm run build`, `npx eslint src/app/page.tsx`, `npx tsc --noEmit`.

## 데이터 모델 (스키마는 `supabase-setup.sql`, SQL editor에서 직접 실행)
- Storage 버킷 **`cctv-photos`** (public read, anon insert/update). 상수 `BUCKET` in `src/lib/supabase.ts`.
  - 업로드 경로: `{sessionId}/{itemId}/{slot}.{ext}` — slot = `before` | `after` | `photo`.
- 테이블 **`cctv_reports`**: 보고서 헤더(id=보고서 uuid, project_name, site_name, contractor, work_period, prepared_by, report_date).
- 테이블 **`cctv_items`**: 항목(report_id FK, type `pair`|`mobile`, item_name, before_url/after_url/photo_url, notes, sort_order).
- ⛔ DB는 에이전트가 직접 수정 금지. 스키마 변경은 `.sql`만 만들어 사용자가 SQL editor에서 실행. 앱 런타임의 anon upsert/insert/delete는 정상 기능.

## 기능
- **기본 정보 폼** + 항목 카드 2종: `pair`(공사 전/후 2장) / `mobile`(캡처 1장).
- 사진 업로드 → Storage 업로드 → publicUrl 저장.
- **자동 저장**: localStorage 즉시 + DB는 debounce 1.5s. 우상단 SaveBadge(저장중/저장됨/실패).
- **기기 간 공유**: 보고서 id를 URL `?id=`에 반영. 마운트 시 URL → localStorage → 신규 순으로 보고서 로드. "🔗 링크 복사" 버튼.
- **항목 순서 이동(▲▼)·삭제**, "새 보고서"(id 재생성).
- **인쇄/PDF**: 화면과 별도의 print 전용 마크업. A4 페이지당 2항목, 헤더 표 매 페이지 반복.
- **사진 회전 ↺/↻**: canvas로 픽셀 자체 회전(`rotateImageBlob`) → Storage 덮어쓰기. preview는 blob URL로 유지(연속 회전 시 캐시 없이 최신 blob 소스 사용).
- **프레임 방향 (2026-06-22 추가)**: 프레임이 사진 실측 비율(`naturalWidth/Height`)을 자동으로 따라가 세로 사진도 여백 없이 꽉 차게. `⤢` 버튼으로 `자동 → 세로 → 가로` 수동 순환. 회전 시 preview(blob) 변경 → 프레임 모드 자동 리셋·재측정. 인쇄도 정사각 강제 제거하고 자동 비율.

## 함정 (Pitfalls)
- **Next.js 16: effect 안에서 `setState` 호출이 lint 에러**(`react-hooks/set-state-in-effect`)로 빌드 실패. "prop 변경 시 상태 리셋"은 effect 대신 **렌더 중 직전 값 비교 패턴**(`if (prop !== prev) { setPrev(prop); setX(...) }`)으로 구현. PhotoUpload의 프레임 모드 리셋이 이 방식.
- 사진 회전 후 **preview를 Supabase URL로 되돌리면 안 됨** — 브라우저 캐시 때문에 다음 회전이 옛 이미지를 소스로 잡음. blob URL 유지하고 supabaseUrl만 갱신(커밋 `f1a0fe2`).
- Vercel은 git push 자동배포 미설정 — 배포는 `vercel --prod --yes` 직접 실행.
- 사용자 선호: 한국어 소통·커밋 메시지, "될 때까지" 실동작 검증.
