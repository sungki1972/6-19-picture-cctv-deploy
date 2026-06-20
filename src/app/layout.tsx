import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '공사 사진대장',
  description: '공사 전/후 사진 기록 및 PDF 출력',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
