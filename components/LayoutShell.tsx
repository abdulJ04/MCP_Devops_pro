'use client';

import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAWS = pathname.startsWith('/aws-dashboard');

  if (isAWS) {
    return (
      <div className="h-full overflow-hidden">
        {children}
      </div>
    );
  }

  return (
    <>
      <Sidebar />
      <main className="md:ml-64 h-full p-4 md:p-8 pt-14 md:pt-8 overflow-y-auto">
        {children}
      </main>
    </>
  );
}
