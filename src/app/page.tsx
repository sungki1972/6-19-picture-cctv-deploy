'use client';

import { useState, useEffect, useRef, useId } from 'react';
import { supabase, BUCKET } from '@/lib/supabase';

// ── Types ──────────────────────────────────────────────────────────
type ItemType = 'pair' | 'mobile';
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface PhotoInfo {
  preview: string | null;
  supabaseUrl: string | null;
  uploading: boolean;
}

interface PhotoItem {
  id: string;
  type: ItemType;
  itemName: string;
  before: PhotoInfo;  // pair
  after: PhotoInfo;   // pair
  photo: PhotoInfo;   // mobile
  notes: string;
}

interface ReportInfo {
  projectName: string;
  siteName: string;
  contractor: string;
  workPeriod: string;
  preparedBy: string;
  reportDate: string;
}

// ── Constants ──────────────────────────────────────────────────────
const LS_KEY = 'cctv-report-v2';

const defaultReport: ReportInfo = {
  projectName: '',
  siteName: '',
  contractor: '',
  workPeriod: '',
  preparedBy: '',
  reportDate: new Date().toISOString().slice(0, 10),
};

const emptyPhoto = (): PhotoInfo => ({ preview: null, supabaseUrl: null, uploading: false });

const newPairItem = (): PhotoItem => ({
  id: crypto.randomUUID(),
  type: 'pair',
  itemName: '',
  before: emptyPhoto(),
  after: emptyPhoto(),
  photo: emptyPhoto(),
  notes: '',
});

const newMobileItem = (): PhotoItem => ({
  id: crypto.randomUUID(),
  type: 'mobile',
  itemName: '',
  before: emptyPhoto(),
  after: emptyPhoto(),
  photo: emptyPhoto(),
  notes: '',
});

function getSessionId() {
  let s = sessionStorage.getItem('cctv-sid');
  if (!s) { s = Date.now().toString(36) + Math.random().toString(36).slice(2, 5); sessionStorage.setItem('cctv-sid', s); }
  return s;
}
function getReportId() {
  let r = localStorage.getItem('cctv-report-id');
  if (!r) { r = crypto.randomUUID(); localStorage.setItem('cctv-report-id', r); }
  return r;
}

// ── DB helpers ─────────────────────────────────────────────────────
async function dbSave(rid: string, report: ReportInfo, items: PhotoItem[]): Promise<boolean> {
  try {
    const { error: e1 } = await supabase.from('cctv_reports').upsert({
      id: rid,
      project_name: report.projectName,
      site_name: report.siteName,
      contractor: report.contractor,
      work_period: report.workPeriod,
      prepared_by: report.preparedBy,
      report_date: report.reportDate,
      updated_at: new Date().toISOString(),
    });
    if (e1) throw e1;

    await supabase.from('cctv_items').delete().eq('report_id', rid);

    if (items.length) {
      const { error: e2 } = await supabase.from('cctv_items').insert(
        items.map((it, i) => ({
          id: it.id,
          report_id: rid,
          type: it.type,
          item_name: it.itemName,
          before_url: it.before.supabaseUrl,
          after_url: it.after.supabaseUrl,
          photo_url: it.photo.supabaseUrl,
          notes: it.notes,
          sort_order: i,
        }))
      );
      if (e2) throw e2;
    }
    return true;
  } catch (err) {
    console.error('DB save:', err);
    return false;
  }
}

async function dbLoad(rid: string): Promise<{ report: ReportInfo; items: PhotoItem[] } | null> {
  try {
    const { data: r, error: e1 } = await supabase
      .from('cctv_reports').select('*').eq('id', rid).single();
    if (e1 || !r) return null;

    const { data: rows } = await supabase
      .from('cctv_items').select('*').eq('report_id', rid).order('sort_order');

    return {
      report: {
        projectName: r.project_name ?? '',
        siteName: r.site_name ?? '',
        contractor: r.contractor ?? '',
        workPeriod: r.work_period ?? '',
        preparedBy: r.prepared_by ?? '',
        reportDate: r.report_date ?? defaultReport.reportDate,
      },
      items: (rows ?? []).map((row: {
        id: string; type: string; item_name: string;
        before_url: string | null; after_url: string | null; photo_url: string | null; notes: string;
      }) => ({
        id: row.id,
        type: (row.type ?? 'pair') as ItemType,
        itemName: row.item_name ?? '',
        before: { preview: row.before_url ?? null, supabaseUrl: row.before_url ?? null, uploading: false },
        after:  { preview: row.after_url  ?? null, supabaseUrl: row.after_url  ?? null, uploading: false },
        photo:  { preview: row.photo_url  ?? null, supabaseUrl: row.photo_url  ?? null, uploading: false },
        notes: row.notes ?? '',
      })),
    };
  } catch { return null; }
}

// ── Sub-components ─────────────────────────────────────────────────

// ── 이미지 회전 (Canvas) ───────────────────────────────────────────
async function rotateImageBlob(previewUrl: string, deg: 90 | -90): Promise<Blob> {
  // 외부 URL(Supabase)은 fetch → blob URL 변환 후 canvas에 그림 (CORS 우회)
  let objectUrl = previewUrl;
  let isTempUrl = false;
  if (!previewUrl.startsWith('blob:')) {
    const res = await fetch(previewUrl);
    const blob = await res.blob();
    objectUrl = URL.createObjectURL(blob);
    isTempUrl = true;
  }

  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        // 90° 회전 시 가로·세로 교환
        canvas.width  = img.height;
        canvas.height = img.width;
        const ctx = canvas.getContext('2d')!;
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((deg * Math.PI) / 180);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);
        canvas.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', 0.92);
      };
      img.onerror = reject;
      img.src = objectUrl;
    });
  } finally {
    if (isTempUrl) URL.revokeObjectURL(objectUrl);
  }
}

// ── Photo Upload Area ──────────────────────────────────────────────
function PhotoUpload({
  photo, label, onFile, onRotate, square = false,
}: {
  photo: PhotoInfo;
  label: string;
  onFile: (f: File) => void;
  onRotate?: (deg: 90 | -90) => void;
  square?: boolean;
}) {
  const uid = useId();
  return (
    <label
      htmlFor={uid}
      className="relative flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors overflow-hidden w-full select-none"
      style={square ? { aspectRatio: '1 / 1' } : { minHeight: 180 }}
    >
      <input
        id={uid}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }}
      />

      {photo.preview ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo.preview}
            alt={label}
            className="absolute inset-0 w-full h-full"
            style={{
              objectFit: square ? 'contain' : 'cover',
              backgroundColor: square ? '#f5f5f5' : 'transparent',
            }}
          />
          {/* 하단 컨트롤 바 */}
          {!photo.uploading && (
            <div className="absolute bottom-0 inset-x-0 z-10 flex items-center justify-between px-2 py-1.5 bg-gradient-to-t from-black/70 via-black/40 to-transparent">
              {/* 회전 버튼 */}
              {onRotate && (
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={e => { e.preventDefault(); e.stopPropagation(); onRotate(-90); }}
                    title="왼쪽으로 90° 회전"
                    className="bg-white/25 hover:bg-white/50 text-white rounded-md w-8 h-7 flex items-center justify-center text-base transition-colors"
                  >↺</button>
                  <button
                    type="button"
                    onClick={e => { e.preventDefault(); e.stopPropagation(); onRotate(90); }}
                    title="오른쪽으로 90° 회전"
                    className="bg-white/25 hover:bg-white/50 text-white rounded-md w-8 h-7 flex items-center justify-center text-base transition-colors"
                  >↻</button>
                </div>
              )}
              <span className="text-white/80 text-xs ml-auto">📷 변경</span>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center py-10 text-gray-400">
          <span className="text-4xl mb-2">{square ? '📱' : '📷'}</span>
          <span className="text-sm font-medium">{label}</span>
          <span className="text-xs mt-1">클릭하여 선택</span>
        </div>
      )}

      {photo.uploading && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-20">
          <span className="text-white text-sm font-semibold">회전 저장 중...</span>
        </div>
      )}
    </label>
  );
}

function SaveBadge({ status }: { status: SaveStatus }) {
  if (status === 'idle') return null;
  const cfg = {
    saving: 'bg-amber-100 text-amber-700',
    saved:  'bg-green-100 text-green-700',
    error:  'bg-red-100 text-red-600',
  }[status];
  const label = { saving: '저장 중...', saved: '✓ 저장됨', error: '⚠ 저장 실패' }[status];
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full transition-all ${cfg}`}>
      {status === 'saving' && <span className="inline-block animate-pulse mr-1">●</span>}
      {label}
    </span>
  );
}

// ── Print subcomponents ────────────────────────────────────────────
const B = '1px solid #000';
const base: React.CSSProperties = { border: B, padding: '4px 8px', fontSize: '9.5pt' };

function PrintPair({ item, num }: { item: PhotoItem; num: number }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 5, pageBreakInside: 'avoid' }}>
      <tbody>
        <tr>
          <td colSpan={2} style={{ ...base, fontWeight: 'bold', fontSize: '10pt', backgroundColor: '#e8e8e8', paddingLeft: 10 }}>
            [{num}] {item.itemName || `항목 ${num}`}
            <span style={{ float: 'right', fontSize: '8pt', color: '#555', fontWeight: 'normal' }}>공사 전/후</span>
          </td>
        </tr>
        <tr>
          <td style={{ ...base, width: '50%', textAlign: 'center', fontWeight: 'bold' }}>공&nbsp;&nbsp;사&nbsp;&nbsp;전</td>
          <td style={{ ...base, width: '50%', textAlign: 'center', fontWeight: 'bold' }}>공&nbsp;&nbsp;사&nbsp;&nbsp;후</td>
        </tr>
        <tr>
          {(['before', 'after'] as const).map(side => (
            <td key={side} style={{ border: B, width: '50%', height: 200, textAlign: 'center', verticalAlign: 'middle', padding: 4 }}>
              {item[side].preview
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={item[side].preview!} alt={side} style={{ maxWidth: '100%', maxHeight: 192, objectFit: 'contain' }} />
                : <span style={{ color: '#bbb', fontSize: '9pt' }}>사진 없음</span>
              }
            </td>
          ))}
        </tr>
        <tr>
          <td colSpan={2} style={{ ...base, paddingLeft: 10 }}>
            <strong>특기사항:</strong> {item.notes || '　'}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function PrintMobile({ item, num }: { item: PhotoItem; num: number }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 5, pageBreakInside: 'avoid' }}>
      <tbody>
        <tr>
          <td style={{ ...base, fontWeight: 'bold', fontSize: '10pt', backgroundColor: '#ebe8f5', paddingLeft: 10 }}>
            [{num}] {item.itemName || `모바일 캡처 ${num}`}
            <span style={{ float: 'right', fontSize: '8pt', color: '#6b5', fontWeight: 'normal' }}>📱 모바일 캡처</span>
          </td>
        </tr>
        <tr>
          <td style={{ border: B, textAlign: 'center', verticalAlign: 'middle', padding: 6, backgroundColor: '#f8f8f8' }}>
            {item.photo.preview
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={item.photo.preview} alt="캡처"
                  style={{ width: 260, height: 260, objectFit: 'contain', display: 'block', margin: '0 auto', backgroundColor: '#f8f8f8' }} />
              : <div style={{ width: 260, height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
                  <span style={{ color: '#bbb', fontSize: '9pt' }}>사진 없음</span>
                </div>
            }
          </td>
        </tr>
        <tr>
          <td style={{ ...base, paddingLeft: 10 }}>
            <strong>설명:</strong> {item.notes || '　'}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

// ── Main ───────────────────────────────────────────────────────────
export default function Home() {
  const [report, setReport] = useState<ReportInfo>(defaultReport);
  const [items, setItems]   = useState<PhotoItem[]>([]);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [copied, setCopied] = useState(false);

  const loadedRef    = useRef(false);
  const sessionRef   = useRef('');
  const reportIdRef  = useRef('');
  const reportRef    = useRef(report);
  const itemsRef     = useRef(items);
  const timerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { reportRef.current = report; }, [report]);
  useEffect(() => { itemsRef.current  = items;  }, [items]);

  // ── Mount: URL ?id= → localStorage → 신규 ──
  useEffect(() => {
    (async () => {
      sessionRef.current = getSessionId();

      // URL에 ?id= 있으면 최우선 사용
      const urlParams = new URLSearchParams(window.location.search);
      let rid = urlParams.get('id');
      if (!rid) {
        // URL에 없으면 localStorage 또는 신규 생성
        rid = localStorage.getItem('cctv-report-id') ?? crypto.randomUUID();
        window.history.replaceState({}, '', `?id=${rid}`);
      }
      localStorage.setItem('cctv-report-id', rid);
      reportIdRef.current = rid;

      const remote = await dbLoad(reportIdRef.current);
      if (remote) {
        setReport(remote.report);
        setItems(remote.items);
        setSaveStatus('saved');
      } else {
        try {
          const raw = localStorage.getItem(LS_KEY);
          if (raw) {
            const s = JSON.parse(raw);
            if (s.report) setReport(s.report);
            if (Array.isArray(s.items)) {
              setItems(s.items.map((p: {
                id: string; type: string; itemName: string;
                beforeUrl: string | null; afterUrl: string | null; photoUrl: string | null; notes: string;
              }) => ({
                id: p.id,
                type: (p.type ?? 'pair') as ItemType,
                itemName: p.itemName ?? '',
                before: { preview: p.beforeUrl ?? null, supabaseUrl: p.beforeUrl ?? null, uploading: false },
                after:  { preview: p.afterUrl  ?? null, supabaseUrl: p.afterUrl  ?? null, uploading: false },
                photo:  { preview: p.photoUrl  ?? null, supabaseUrl: p.photoUrl  ?? null, uploading: false },
                notes: p.notes ?? '',
              })));
            }
          }
        } catch { /* ignore */ }
      }
      loadedRef.current = true;
    })();
  }, []);

  // ── Auto-save: localStorage (instant) + DB (debounced 1.5s) ──
  useEffect(() => {
    if (!loadedRef.current) return;

    localStorage.setItem(LS_KEY, JSON.stringify({
      report,
      items: items.map(it => ({
        id: it.id, type: it.type, itemName: it.itemName,
        beforeUrl: it.before.supabaseUrl, afterUrl: it.after.supabaseUrl,
        photoUrl: it.photo.supabaseUrl, notes: it.notes,
      })),
    }));

    if (timerRef.current) clearTimeout(timerRef.current);
    setSaveStatus('saving');
    timerRef.current = setTimeout(async () => {
      const ok = await dbSave(reportIdRef.current, reportRef.current, itemsRef.current);
      setSaveStatus(ok ? 'saved' : 'error');
    }, 1500);
  }, [report, items]);

  // Auto-hide 'saved' badge after 3s
  useEffect(() => {
    if (saveStatus !== 'saved') return;
    const t = setTimeout(() => setSaveStatus('idle'), 3000);
    return () => clearTimeout(t);
  }, [saveStatus]);

  // ── Photo upload ──
  const uploadPhoto = async (file: File, itemId: string, slot: 'before' | 'after' | 'photo') => {
    const blob = URL.createObjectURL(file);
    setItems(prev => prev.map(it => it.id === itemId
      ? { ...it, [slot]: { ...it[slot], preview: blob, uploading: true } } : it));

    try {
      const ext  = file.name.split('.').pop() ?? 'jpg';
      const path = `${sessionRef.current}/${itemId}/${slot}.${ext}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);
      setItems(prev => prev.map(it => it.id === itemId
        ? { ...it, [slot]: { preview: publicUrl, supabaseUrl: publicUrl, uploading: false } } : it));
    } catch (err) {
      console.error('Upload:', err);
      setItems(prev => prev.map(it => it.id === itemId
        ? { ...it, [slot]: { ...it[slot], uploading: false } } : it));
    }
  };

  const deleteItem = (id: string) => setItems(prev => prev.filter(it => it.id !== id));

  const moveItem = (id: string, dir: -1 | 1) =>
    setItems(prev => {
      const idx = prev.findIndex(it => it.id === id);
      if (idx < 0) return prev;
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });

  const updateItem = (id: string, fn: (it: PhotoItem) => PhotoItem) =>
    setItems(prev => prev.map(it => it.id === id ? fn(it) : it));

  // ── 사진 회전 ──
  const rotatePhoto = async (itemId: string, slot: 'before' | 'after' | 'photo', deg: 90 | -90) => {
    const item = itemsRef.current.find(it => it.id === itemId);
    if (!item) return;
    const src = item[slot].preview;
    if (!src) return;

    // 업로드 중 스피너 표시
    setItems(prev => prev.map(it => it.id === itemId
      ? { ...it, [slot]: { ...it[slot], uploading: true } } : it));

    try {
      const rotatedBlob = await rotateImageBlob(src, deg);
      const newPreview = URL.createObjectURL(rotatedBlob);

      // 로컬 미리보기 즉시 반영
      setItems(prev => prev.map(it => it.id === itemId
        ? { ...it, [slot]: { preview: newPreview, supabaseUrl: it[slot].supabaseUrl, uploading: true } } : it));

      // Supabase에 덮어쓰기 업로드
      const file = new File([rotatedBlob], `${slot}.jpg`, { type: 'image/jpeg' });
      const path = `${sessionRef.current}/${itemId}/${slot}.jpg`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);

      // preview는 blob URL 그대로 유지 — 다음 회전이 캐시 없이 최신 blob을 소스로 사용
      // supabaseUrl만 갱신해 DB 저장에 반영
      setItems(prev => prev.map(it => it.id === itemId
        ? { ...it, [slot]: { preview: newPreview, supabaseUrl: publicUrl, uploading: false } } : it));
    } catch (err) {
      console.error('Rotate upload:', err);
      setItems(prev => prev.map(it => it.id === itemId
        ? { ...it, [slot]: { ...it[slot], uploading: false } } : it));
    }
  };

  const handleReset = () => {
    if (!confirm('새 보고서를 시작합니다. 현재 데이터가 초기화됩니다.')) return;
    const newId = crypto.randomUUID();
    localStorage.setItem('cctv-report-id', newId);
    localStorage.removeItem(LS_KEY);
    reportIdRef.current = newId;
    window.history.replaceState({}, '', `?id=${newId}`);
    setReport(defaultReport);
    setItems([]);
    setSaveStatus('idle');
  };

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // ── Print chunks (2 items per A4 page) ──
  const chunks: PhotoItem[][] = [];
  for (let i = 0; i < Math.max(items.length, 1); i += 2)
    chunks.push(items.slice(i, i + 2));

  const th: React.CSSProperties = { border: B, padding: '4px 6px', fontSize: '9.5pt', fontWeight: 'bold', textAlign: 'center', width: '18%', backgroundColor: '#ebebeb', whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { border: B, padding: '4px 8px', fontSize: '9.5pt', width: '32%' };

  // ── Render ─────────────────────────────────────────────────────
  return (
    <>
      {/* ═══════ SCREEN ═══════ */}
      <div className="print:hidden min-h-screen bg-slate-50">

        {/* Header */}
        <header className="bg-blue-700 text-white px-5 py-3.5 flex items-center gap-2 shadow-md">
          <h1 className="text-lg font-bold tracking-wide flex-1">🏗️ 공사 사진대장</h1>
          <SaveBadge status={saveStatus} />
          <button onClick={copyLink}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
              copied
                ? 'bg-green-500 border-green-400 text-white'
                : 'text-white/70 hover:text-white border-white/30 hover:border-white/60'
            }`}
            title="이 링크를 다른 기기에서 열면 같은 데이터를 볼 수 있습니다">
            {copied ? '✓ 복사됨' : '🔗 링크 복사'}
          </button>
          <button onClick={handleReset}
            className="text-white/70 hover:text-white text-xs border border-white/30 hover:border-white/60 px-3 py-1.5 rounded-lg transition-colors">
            새 보고서
          </button>
          <button onClick={() => window.print()}
            className="bg-white text-blue-700 font-semibold px-4 py-1.5 rounded-lg text-sm hover:bg-blue-50 transition-colors shadow-sm">
            🖨️ 인쇄 / PDF
          </button>
        </header>

        <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">

          {/* 기본 정보 */}
          <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">📋 기본 정보</h2>
            <div className="grid grid-cols-2 gap-3">
              {([
                ['projectName', '공사명',   '예: CCTV 설치공사'],
                ['siteName',    '현장명',   '예: XX빌딩 1층'],
                ['contractor',  '시공자',   '시공 업체명'],
                ['workPeriod',  '공사기간', '예: 2026.06.19 ~ 2026.06.20'],
                ['preparedBy',  '작성자',   '작성자 이름'],
              ] as [keyof ReportInfo, string, string][]).map(([k, label, ph]) => (
                <div key={k}>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">{label}</label>
                  <input type="text" value={report[k]}
                    onChange={e => setReport(r => ({ ...r, [k]: e.target.value }))}
                    placeholder={ph}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100" />
                </div>
              ))}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">작성일</label>
                <input type="date" value={report.reportDate}
                  onChange={e => setReport(r => ({ ...r, reportDate: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100" />
              </div>
            </div>
          </section>

          {/* 사진 항목 카드들 */}
          {items.map((item, idx) => (
            <section key={item.id}
              className={`bg-white rounded-2xl shadow-sm border-l-4 border border-gray-100 p-5
                ${item.type === 'pair' ? 'border-l-blue-500' : 'border-l-violet-500'}`}>

              {/* Card header */}
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100">
                {/* 타입 뱃지 */}
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full shrink-0
                  ${item.type === 'pair'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-violet-100 text-violet-700'}`}>
                  {item.type === 'pair' ? '📷 공사 전/후' : '📱 모바일 캡처'}
                </span>
                <span className="text-xs text-gray-400 shrink-0">항목 {idx + 1}</span>
                <div className="flex-1" />

                {/* 순서 이동 + 삭제 버튼 그룹 */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => moveItem(item.id, -1)}
                    disabled={idx === 0}
                    title="위로 이동"
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => moveItem(item.id, 1)}
                    disabled={idx === items.length - 1}
                    title="아래로 이동"
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                  >
                    ▼
                  </button>
                  <div className="w-px h-4 bg-gray-200 mx-1" />
                  <button
                    onClick={() => {
                      if (confirm(`항목 ${idx + 1}을 삭제하시겠습니까?`)) deleteItem(item.id);
                    }}
                    title="삭제"
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors text-base"
                  >
                    🗑
                  </button>
                </div>
              </div>

              {/* 항목명 */}
              <div className="mb-4">
                <label className="block text-xs font-semibold text-gray-500 mb-1">항목명</label>
                <input type="text" value={item.itemName}
                  onChange={e => updateItem(item.id, it => ({ ...it, itemName: e.target.value }))}
                  placeholder={item.type === 'pair' ? '예: CCTV 1번 - 현관 입구' : '예: CCTV 모니터링 화면'}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100" />
              </div>

              {/* Photos */}
              {item.type === 'pair' ? (
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-1.5">공사 전</p>
                    <PhotoUpload photo={item.before} label="공사 전 사진"
                      onFile={f => uploadPhoto(f, item.id, 'before')}
                      onRotate={deg => rotatePhoto(item.id, 'before', deg)} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-1.5">공사 후</p>
                    <PhotoUpload photo={item.after} label="공사 후 사진"
                      onFile={f => uploadPhoto(f, item.id, 'after')}
                      onRotate={deg => rotatePhoto(item.id, 'after', deg)} />
                  </div>
                </div>
              ) : (
                <div className="mb-4">
                  <p className="text-xs font-semibold text-violet-600 mb-1.5">캡처 사진 (1:1)</p>
                  <PhotoUpload photo={item.photo} label="모바일 캡처 사진"
                    onFile={f => uploadPhoto(f, item.id, 'photo')}
                    onRotate={deg => rotatePhoto(item.id, 'photo', deg)}
                    square />
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">
                  {item.type === 'pair' ? '특기사항' : '설명'}
                </label>
                <textarea value={item.notes} rows={2}
                  onChange={e => updateItem(item.id, it => ({ ...it, notes: e.target.value }))}
                  placeholder={item.type === 'pair' ? '특기사항 입력 (선택)' : '화면 설명 입력 (선택)'}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 resize-none" />
              </div>
            </section>
          ))}

          {/* 항목 추가 버튼 2종 */}
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => setItems(p => [...p, newPairItem()])}
              className="bg-white border-2 border-dashed border-blue-300 text-blue-600 font-semibold rounded-2xl py-4 text-sm hover:bg-blue-50 hover:border-blue-400 transition-colors">
              📷 공사 전/후 항목 추가
            </button>
            <button onClick={() => setItems(p => [...p, newMobileItem()])}
              className="bg-white border-2 border-dashed border-violet-300 text-violet-600 font-semibold rounded-2xl py-4 text-sm hover:bg-violet-50 hover:border-violet-400 transition-colors">
              📱 모바일 캡처 추가
            </button>
          </div>

          {items.length === 0 && (
            <p className="text-center text-gray-400 text-sm pb-2">
              위 버튼을 눌러 사진 항목을 추가하세요
            </p>
          )}

        </div>
      </div>

      {/* ═══════ PRINT ═══════ */}
      <div className="hidden print:block"
        style={{ fontFamily: "'Malgun Gothic', '맑은 고딕', Arial, sans-serif" }}>
        {chunks.map((chunk, pi) => (
          <div key={pi} style={{ pageBreakAfter: pi < chunks.length - 1 ? 'always' : 'auto' }}>

            {/* 보고서 헤더 — 매 페이지 반복 */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 6 }}>
              <tbody>
                <tr>
                  <td colSpan={4} style={{
                    textAlign: 'center', fontSize: '18pt', fontWeight: 'bold',
                    padding: '10px 0 8px', border: '2px solid #000', letterSpacing: '12px',
                  }}>
                    공&nbsp;&nbsp;사&nbsp;&nbsp;사&nbsp;&nbsp;진&nbsp;&nbsp;대&nbsp;&nbsp;장
                  </td>
                </tr>
                <tr>
                  <td style={th}>공&nbsp;사&nbsp;명</td><td style={td}>{report.projectName}</td>
                  <td style={th}>현&nbsp;장&nbsp;명</td><td style={td}>{report.siteName}</td>
                </tr>
                <tr>
                  <td style={th}>시&nbsp;공&nbsp;자</td><td style={td}>{report.contractor}</td>
                  <td style={th}>공&nbsp;사&nbsp;기&nbsp;간</td><td style={td}>{report.workPeriod}</td>
                </tr>
                <tr>
                  <td style={th}>작&nbsp;성&nbsp;자</td><td style={td}>{report.preparedBy}</td>
                  <td style={th}>작&nbsp;성&nbsp;일</td><td style={td}>{report.reportDate}</td>
                </tr>
              </tbody>
            </table>

            {/* 사진 항목들 */}
            {chunk.map((item, ci) =>
              item.type === 'pair'
                ? <PrintPair   key={item.id} item={item} num={pi * 2 + ci + 1} />
                : <PrintMobile key={item.id} item={item} num={pi * 2 + ci + 1} />
            )}

            {/* 홀수일 때 마지막 빈 슬롯 */}
            {chunk.length === 1 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', pageBreakInside: 'avoid' }}>
                <tbody>
                  <tr><td colSpan={2} style={{ border: B, height: 36, backgroundColor: '#e8e8e8' }} /></tr>
                  <tr>
                    <td style={{ border: B, width: '50%', height: 28, textAlign: 'center', fontWeight: 'bold', fontSize: '9.5pt' }}>공&nbsp;&nbsp;사&nbsp;&nbsp;전</td>
                    <td style={{ border: B, width: '50%', height: 28, textAlign: 'center', fontWeight: 'bold', fontSize: '9.5pt' }}>공&nbsp;&nbsp;사&nbsp;&nbsp;후</td>
                  </tr>
                  <tr>
                    <td style={{ border: B, height: 200 }} />
                    <td style={{ border: B, height: 200 }} />
                  </tr>
                  <tr><td colSpan={2} style={{ border: B, padding: '4px 10px', fontSize: '9.5pt' }}><strong>특기사항:</strong></td></tr>
                </tbody>
              </table>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
