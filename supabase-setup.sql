-- ============================================================
-- Supabase Dashboard > SQL Editor 에서 전체 실행
-- ============================================================

-- 1. Storage 버킷 (이미 생성했으면 SKIP)
INSERT INTO storage.buckets (id, name, public)
VALUES ('cctv-photos', 'cctv-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY IF NOT EXISTS "cctv anon insert"  ON storage.objects FOR INSERT TO anon WITH CHECK (bucket_id = 'cctv-photos');
CREATE POLICY IF NOT EXISTS "cctv anon update"  ON storage.objects FOR UPDATE TO anon USING (bucket_id = 'cctv-photos');
CREATE POLICY IF NOT EXISTS "cctv public read"  ON storage.objects FOR SELECT TO public USING (bucket_id = 'cctv-photos');

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
  type        text NOT NULL DEFAULT 'pair',   -- 'pair' | 'mobile'
  item_name   text DEFAULT '',
  before_url  text,           -- pair: 공사 전
  after_url   text,           -- pair: 공사 후
  photo_url   text,           -- mobile: 캡처 사진
  notes       text DEFAULT '',
  sort_order  int  DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

-- 4. RLS (인증 없이 anon 접근 허용)
ALTER TABLE public.cctv_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cctv_items   ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='cctv_reports' AND policyname='anon all cctv_reports') THEN
    CREATE POLICY "anon all cctv_reports" ON public.cctv_reports FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='cctv_items' AND policyname='anon all cctv_items') THEN
    CREATE POLICY "anon all cctv_items" ON public.cctv_items FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
END $$;
