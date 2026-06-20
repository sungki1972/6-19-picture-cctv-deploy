'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase, BUCKET } from '@/lib/supabase';

// ── Types ──────────────────────────────────────────────────────────
interface PhotoInfo {
  preview: string | null;  // blob URL (fresh) or Supabase URL (restored)
  supabaseUrl: string | null;
  uploading: boolean;
}

interface PhotoPair {
  id: string;
  itemName: string;
  before: PhotoInfo;
  after: PhotoInfo;
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
const LS_KEY = 'cctv-report-v1';

const defaultReport: ReportInfo = {
  projectName: '',
  siteName: '',
  contractor: '',
  workPeriod: '',
  preparedBy: '',
  reportDate: new Date().toISOString().slice(0, 10),
};

function emptyPhoto(): PhotoInfo {
  return { preview: null, supabaseUrl: null, uploading: false };
}

function getSessionId(): string {
  let sid = sessionStorage.getItem('cctv-sid');
  if (!sid) {
    sid = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    sessionStorage.setItem('cctv-sid', sid);
  }
  return sid;
}

// ── Photo Upload Area ──────────────────────────────────────────────
function PhotoUploadArea({
  photo,
  label,
  onFile,
}: {
  photo: PhotoInfo;
  label: string;
  onFile: (file: File) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);

  return (
    <div
      onClick={() => ref.current?.click()}
      className="relative flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors overflow-hidden"
      style={{ minHeight: 180 }}
    >
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />

      {photo.preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo.preview}
          alt={label}
          className="w-full h-full object-cover"
          style={{ maxHeight: 200 }}
        />
      ) : (
        <>
          <span className="text-4xl mb-2">📷</span>
          <span className="text-sm font-medium text-gray-500">{label}</span>
          <span className="text-xs text-gray-400 mt-1">클릭하여 선택</span>
        </>
      )}

      {photo.uploading && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
          <span className="text-white text-sm font-semibold">업로드 중...</span>
        </div>
      )}

      {photo.preview && !photo.uploading && (
        <div className="absolute bottom-1 right-1 bg-white/80 rounded px-1.5 py-0.5 text-xs text-gray-600">
          클릭하여 변경
        </div>
      )}
    </div>
  );
}

// ── Print: single photo pair ───────────────────────────────────────
function PrintPair({ pair, num }: { pair: PhotoPair; num: number }) {
  const border = '1px solid #000';
  const base: React.CSSProperties = { border, padding: '4px 8px', fontSize: '9.5pt' };
  const imgCell: React.CSSProperties = {
    border,
    width: '50%',
    height: 210,
    textAlign: 'center',
    verticalAlign: 'middle',
    padding: 4,
  };

  return (
    <table
      style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 6, pageBreakInside: 'avoid' }}
    >
      <tbody>
        <tr>
          <td
            colSpan={2}
            style={{
              ...base,
              fontWeight: 'bold',
              fontSize: '10pt',
              backgroundColor: '#e8e8e8',
              paddingLeft: 10,
            }}
          >
            [{num}] {pair.itemName || `항목 ${num}`}
          </td>
        </tr>
        <tr>
          <td style={{ ...base, width: '50%', textAlign: 'center', fontWeight: 'bold' }}>
            공&nbsp;&nbsp;사&nbsp;&nbsp;전
          </td>
          <td style={{ ...base, width: '50%', textAlign: 'center', fontWeight: 'bold' }}>
            공&nbsp;&nbsp;사&nbsp;&nbsp;후
          </td>
        </tr>
        <tr>
          <td style={imgCell}>
            {pair.before.preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={pair.before.preview}
                alt="공사전"
                style={{ maxWidth: '100%', maxHeight: 200, objectFit: 'contain' }}
              />
            ) : (
              <span style={{ color: '#aaa', fontSize: '9pt' }}>사진 없음</span>
            )}
          </td>
          <td style={imgCell}>
            {pair.after.preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={pair.after.preview}
                alt="공사후"
                style={{ maxWidth: '100%', maxHeight: 200, objectFit: 'contain' }}
              />
            ) : (
              <span style={{ color: '#aaa', fontSize: '9pt' }}>사진 없음</span>
            )}
          </td>
        </tr>
        <tr>
          <td colSpan={2} style={{ ...base, paddingLeft: 10 }}>
            <strong>특기사항:</strong> {pair.notes || '　'}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

// ── Main Component ─────────────────────────────────────────────────
export default function Home() {
  const [report, setReport] = useState<ReportInfo>(defaultReport);
  const [pairs, setPairs] = useState<PhotoPair[]>([]);
  const loaded = useRef(false);
  const sessionId = useRef('');

  // Load from localStorage on mount
  useEffect(() => {
    sessionId.current = getSessionId();
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.report) setReport(saved.report);
        if (Array.isArray(saved.pairs)) {
          setPairs(
            saved.pairs.map((p: {
              id: string;
              itemName: string;
              beforeUrl: string | null;
              afterUrl: string | null;
              notes: string;
            }) => ({
              id: p.id,
              itemName: p.itemName ?? '',
              before: { preview: p.beforeUrl ?? null, supabaseUrl: p.beforeUrl ?? null, uploading: false },
              after: { preview: p.afterUrl ?? null, supabaseUrl: p.afterUrl ?? null, uploading: false },
              notes: p.notes ?? '',
            }))
          );
        }
      }
    } catch {
      // ignore parse errors
    }
    loaded.current = true;
  }, []);

  // Auto-save to localStorage (skips initial render before load)
  useEffect(() => {
    if (!loaded.current) return;
    localStorage.setItem(
      LS_KEY,
      JSON.stringify({
        report,
        pairs: pairs.map((p) => ({
          id: p.id,
          itemName: p.itemName,
          beforeUrl: p.before.supabaseUrl,
          afterUrl: p.after.supabaseUrl,
          notes: p.notes,
        })),
      })
    );
  }, [report, pairs]);

  // ── Pair helpers ──────────────────────────────────────────────────
  const addPair = () =>
    setPairs((prev) => [
      ...prev,
      { id: Date.now().toString(36), itemName: '', before: emptyPhoto(), after: emptyPhoto(), notes: '' },
    ]);

  const deletePair = (id: string) => setPairs((prev) => prev.filter((p) => p.id !== id));

  const updatePair = (id: string, updater: (p: PhotoPair) => PhotoPair) =>
    setPairs((prev) => prev.map((p) => (p.id === id ? updater(p) : p)));

  // ── Photo upload ──────────────────────────────────────────────────
  const uploadPhoto = async (file: File, pairId: string, side: 'before' | 'after') => {
    const blobUrl = URL.createObjectURL(file);
    updatePair(pairId, (p) => ({ ...p, [side]: { ...p[side], preview: blobUrl, uploading: true } }));

    try {
      const ext = file.name.split('.').pop() ?? 'jpg';
      const path = `${sessionId.current}/${pairId}/${side}.${ext}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);
      updatePair(pairId, (p) => ({
        ...p,
        [side]: { preview: publicUrl, supabaseUrl: publicUrl, uploading: false },
      }));
    } catch (err) {
      console.error('Upload failed:', err);
      updatePair(pairId, (p) => ({ ...p, [side]: { ...p[side], uploading: false } }));
    }
  };

  const handleReset = () => {
    if (!confirm('모든 데이터를 초기화하시겠습니까?')) return;
    localStorage.removeItem(LS_KEY);
    setReport(defaultReport);
    setPairs([]);
  };

  // ── Print page chunks (2 pairs per A4 page) ───────────────────────
  const pageChunks: PhotoPair[][] = [];
  for (let i = 0; i < Math.max(pairs.length, 1); i += 2) {
    pageChunks.push(pairs.slice(i, i + 2));
  }

  const thStyle: React.CSSProperties = {
    border: '1px solid #000',
    padding: '4px 6px',
    fontSize: '9.5pt',
    fontWeight: 'bold',
    textAlign: 'center',
    width: '18%',
    backgroundColor: '#ebebeb',
    whiteSpace: 'nowrap',
  };
  const tdStyle: React.CSSProperties = {
    border: '1px solid #000',
    padding: '4px 8px',
    fontSize: '9.5pt',
    width: '32%',
  };

  // ── Render ────────────────────────────────────────────────────────
  return (
    <>
      {/* ═══ SCREEN UI (hidden during print) ═══ */}
      <div className="print:hidden min-h-screen bg-slate-50">
        <header className="bg-blue-700 text-white px-6 py-4 flex items-center justify-between shadow-md">
          <h1 className="text-lg font-bold tracking-wide">🏗️ 공사 사진대장</h1>
          <div className="flex gap-2">
            <button
              onClick={handleReset}
              className="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg text-sm transition-colors"
            >
              초기화
            </button>
            <button
              onClick={() => window.print()}
              className="bg-white text-blue-700 font-semibold px-4 py-1.5 rounded-lg text-sm hover:bg-blue-50 transition-colors"
            >
              🖨️ 인쇄 / PDF
            </button>
          </div>
        </header>

        <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
          {/* Basic info section */}
          <section className="bg-white rounded-2xl shadow p-5">
            <h2 className="text-base font-bold text-gray-800 mb-4 pb-2 border-b">📋 기본 정보</h2>
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  ['projectName', '공사명', '예: CCTV 설치공사'],
                  ['siteName', '현장명', '예: XX빌딩 1층'],
                  ['contractor', '시공자', '시공 업체명'],
                  ['workPeriod', '공사기간', '예: 2026.06.19 ~ 2026.06.20'],
                  ['preparedBy', '작성자', '작성자 이름'],
                ] as [keyof ReportInfo, string, string][]
              ).map(([key, label, placeholder]) => (
                <div key={key}>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
                  <input
                    type="text"
                    value={report[key]}
                    onChange={(e) => setReport((r) => ({ ...r, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
                  />
                </div>
              ))}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">작성일</label>
                <input
                  type="date"
                  value={report.reportDate}
                  onChange={(e) => setReport((r) => ({ ...r, reportDate: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
                />
              </div>
            </div>
          </section>

          {/* Photo pair sections */}
          {pairs.map((pair, idx) => (
            <section key={pair.id} className="bg-white rounded-2xl shadow p-5">
              <div className="flex items-center justify-between mb-3 pb-2 border-b">
                <h3 className="font-bold text-gray-800">📸 항목 {idx + 1}</h3>
                <button
                  onClick={() => deletePair(pair.id)}
                  className="text-red-400 hover:text-red-600 text-sm transition-colors"
                >
                  ✕ 삭제
                </button>
              </div>

              <div className="mb-3">
                <label className="block text-xs font-semibold text-gray-600 mb-1">항목명</label>
                <input
                  type="text"
                  value={pair.itemName}
                  onChange={(e) => updatePair(pair.id, (p) => ({ ...p, itemName: e.target.value }))}
                  placeholder="예: CCTV 1번 - 현관 입구"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <p className="text-xs font-semibold text-gray-600 mb-1">공사 전</p>
                  <PhotoUploadArea
                    photo={pair.before}
                    label="공사 전 사진"
                    onFile={(f) => uploadPhoto(f, pair.id, 'before')}
                  />
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-600 mb-1">공사 후</p>
                  <PhotoUploadArea
                    photo={pair.after}
                    label="공사 후 사진"
                    onFile={(f) => uploadPhoto(f, pair.id, 'after')}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">특기사항</label>
                <textarea
                  value={pair.notes}
                  onChange={(e) => updatePair(pair.id, (p) => ({ ...p, notes: e.target.value }))}
                  placeholder="특기사항 입력 (선택)"
                  rows={2}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 resize-none"
                />
              </div>
            </section>
          ))}

          {/* Add button */}
          <button
            onClick={addPair}
            className="w-full bg-white border-2 border-dashed border-blue-300 text-blue-500 font-medium rounded-2xl py-4 text-sm hover:bg-blue-50 hover:border-blue-400 transition-colors"
          >
            + 사진 항목 추가
          </button>

          {pairs.length === 0 && (
            <p className="text-center text-gray-400 text-sm pb-4">
              위 버튼을 눌러 공사 전/후 사진 항목을 추가하세요
            </p>
          )}
        </div>
      </div>

      {/* ═══ PRINT LAYOUT (hidden on screen, shown during print) ═══ */}
      <div
        className="hidden print:block"
        style={{ fontFamily: "'Malgun Gothic', '맑은 고딕', Arial, sans-serif" }}
      >
        {pageChunks.map((chunk, pageIdx) => (
          <div
            key={pageIdx}
            style={{ pageBreakAfter: pageIdx < pageChunks.length - 1 ? 'always' : 'auto' }}
          >
            {/* Report header — repeated on every page */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 6 }}>
              <tbody>
                <tr>
                  <td
                    colSpan={4}
                    style={{
                      textAlign: 'center',
                      fontSize: '18pt',
                      fontWeight: 'bold',
                      padding: '10px 0 8px',
                      border: '2px solid #000',
                      letterSpacing: '12px',
                    }}
                  >
                    공&nbsp;&nbsp;사&nbsp;&nbsp;사&nbsp;&nbsp;진&nbsp;&nbsp;대&nbsp;&nbsp;장
                  </td>
                </tr>
                <tr>
                  <td style={thStyle}>공&nbsp;사&nbsp;명</td>
                  <td style={tdStyle}>{report.projectName}</td>
                  <td style={thStyle}>현&nbsp;장&nbsp;명</td>
                  <td style={tdStyle}>{report.siteName}</td>
                </tr>
                <tr>
                  <td style={thStyle}>시&nbsp;공&nbsp;자</td>
                  <td style={tdStyle}>{report.contractor}</td>
                  <td style={thStyle}>공&nbsp;사&nbsp;기&nbsp;간</td>
                  <td style={tdStyle}>{report.workPeriod}</td>
                </tr>
                <tr>
                  <td style={thStyle}>작&nbsp;성&nbsp;자</td>
                  <td style={tdStyle}>{report.preparedBy}</td>
                  <td style={thStyle}>작&nbsp;성&nbsp;일</td>
                  <td style={tdStyle}>{report.reportDate}</td>
                </tr>
              </tbody>
            </table>

            {/* Photo pairs */}
            {chunk.map((pair, idx) => (
              <PrintPair key={pair.id} pair={pair} num={pageIdx * 2 + idx + 1} />
            ))}

            {/* Empty slot when last page has only 1 pair */}
            {chunk.length === 1 && (
              <table
                style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 6, pageBreakInside: 'avoid' }}
              >
                <tbody>
                  <tr>
                    <td colSpan={2} style={{ border: '1px solid #000', height: 36, backgroundColor: '#e8e8e8' }} />
                  </tr>
                  <tr>
                    <td style={{ border: '1px solid #000', width: '50%', height: 30, textAlign: 'center', fontWeight: 'bold', fontSize: '9.5pt' }}>
                      공&nbsp;&nbsp;사&nbsp;&nbsp;전
                    </td>
                    <td style={{ border: '1px solid #000', width: '50%', height: 30, textAlign: 'center', fontWeight: 'bold', fontSize: '9.5pt' }}>
                      공&nbsp;&nbsp;사&nbsp;&nbsp;후
                    </td>
                  </tr>
                  <tr>
                    <td style={{ border: '1px solid #000', height: 210 }} />
                    <td style={{ border: '1px solid #000', height: 210 }} />
                  </tr>
                  <tr>
                    <td colSpan={2} style={{ border: '1px solid #000', padding: '4px 10px', fontSize: '9.5pt' }}>
                      <strong>특기사항:</strong>
                    </td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
