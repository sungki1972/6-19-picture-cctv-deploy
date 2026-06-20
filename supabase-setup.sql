-- Supabase Dashboard > SQL Editor 에서 실행
-- Storage > cctv-photos 버킷 생성 + anon 업로드/조회 허용

INSERT INTO storage.buckets (id, name, public)
VALUES ('cctv-photos', 'cctv-photos', true)
ON CONFLICT (id) DO NOTHING;

-- anon 업로드 허용
CREATE POLICY "cctv anon insert"
ON storage.objects FOR INSERT
TO anon
WITH CHECK (bucket_id = 'cctv-photos');

-- anon 덮어쓰기 허용 (upsert)
CREATE POLICY "cctv anon update"
ON storage.objects FOR UPDATE
TO anon
USING (bucket_id = 'cctv-photos');

-- 공개 읽기
CREATE POLICY "cctv public read"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'cctv-photos');
