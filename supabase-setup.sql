-- ============================================================
-- Supabase Dashboard > SQL Editor 에서 전체 실행
-- 재실행해도 안전 (DROP IF EXISTS 사용)
-- ============================================================

-- 1. Storage 버킷 (이미 생성했으면 무시됨)
INSERT INTO storage.buckets (id, name, public)
VALUES ('cctv-photos', 'cctv-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage 정책 (DROP 후 재생성으로 중복 방지)
DROP POLICY IF EXISTS "cctv anon insert" ON storage.objects;
CREATE POLICY "cctv anon insert" ON storage.objects
  FOR INSERT TO anon WITH CHECK (bucket_id = 'cctv-photos');

DROP POLICY IF EXISTS "cctv anon update" ON storage.objects;
CREATE POLICY "cctv anon update" ON storage.objects
  FOR UPDATE TO anon USING (bucket_id = 'cctv-photos');

DROP POLICY IF EXISTS "cctv public read" ON storage.objects;
CREATE POLICY "cctv public read" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'cctv-photos');

-- 2. 공사 보고서 헤더 테이블
CREATE TABLE IF NOT EXISTS public.cctv_reports (
  id           uuid PRIMARY KEY,
  project_name text DEFAULT '',
  site_name    text DEFAULT '',
  contractor   text DEFAULT '',
  work_period  text DEFAULT '',
  prepared_by  text DEFAULT '',
  report_date  text DEFAULT '',
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

-- 3. 사진 항목 테이블 (공사전/후 + 모바일 캡처 통합)
CREATE TABLE IF NOT EXISTS public.cctv_items (
  id          uuid PRIMARY KEY,
  report_id   uuid REFERENCES public.cctv_reports(id) ON DELETE CASCADE,
  type        text NOT NULL DEFAULT 'pair',
  item_name   text DEFAULT '',
  before_url  text,
  after_url   text,
  photo_url   text,
  notes       text DEFAULT '',
  sort_order  int  DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

-- 4. RLS 활성화
ALTER TABLE public.cctv_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cctv_items   ENABLE ROW LEVEL SECURITY;

-- 5. 테이블 정책 (중복 방지)
DROP POLICY IF EXISTS "anon all cctv_reports" ON public.cctv_reports;
CREATE POLICY "anon all cctv_reports" ON public.cctv_reports
  FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon all cctv_items" ON public.cctv_items;
CREATE POLICY "anon all cctv_items" ON public.cctv_items
  FOR ALL TO anon USING (true) WITH CHECK (true);
