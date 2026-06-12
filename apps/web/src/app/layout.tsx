import type { ReactNode } from 'react';

export const metadata = { title: 'Dashy.ai', description: 'See what your AI agents shipped overnight' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
