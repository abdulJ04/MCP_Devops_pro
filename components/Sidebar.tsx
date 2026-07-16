'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { BsGear, BsCloud, BsCodeSquare, BsShieldCheck, 
         BsDiagram3, BsGraphUp, BsSpeedometer, BsBug, 
         BsHouseDoor, BsList, BsX, BsLightbulb, BsRobot, BsPeople, BsAmazon } from 'react-icons/bs';

const menuItems = [
  { icon: <BsHouseDoor size={18} />, name: "Home", path: "/" },
  { icon: <BsGear size={18} />, name: "CI/CD Pipeline", path: "/ci-cd" },
  { icon: <BsAmazon size={18} />, name: "AWS Dashboard", path: "/aws-dashboard" },
  { icon: <BsCloud size={18} />, name: "Cloud Infrastructure", path: "/cloud-infrastructure" },
  { icon: <BsCodeSquare size={18} />, name: "Code Analysis", path: "/code-analysis" },
  { icon: <BsShieldCheck size={18} />, name: "Security Scanning", path: "/security-scanning" },
  { icon: <BsDiagram3 size={18} />, name: "Container Orchestration", path: "/container-orchestration" },
  { icon: <BsGraphUp size={18} />, name: "Performance Monitoring", path: "/performance-monitoring" },
  { icon: <BsSpeedometer size={18} />, name: "Load Testing", path: "/load-testing" },
  { icon: <BsBug size={18} />, name: "Incident Response", path: "/incident-response" },
  { icon: <BsPeople size={18} />, name: "About Us", path: "/about" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [navigating, setNavigating] = useState<string | null>(null);

  useEffect(() => { setMounted(true); }, []);
  
  // Reset navigating when path changes
  useEffect(() => { setNavigating(null); }, [pathname]);

  return (
    <>
      {/* Mobile overlay backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-20 md:hidden backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Mobile toggle button */}
      <button
        className="fixed top-3 left-3 z-30 p-2 rounded-lg bg-white dark:bg-gray-800 shadow-md border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 md:hidden hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? <BsX size={20} /> : <BsList size={20} />}
      </button>

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 h-full w-64 bg-[#f8f9fa] dark:bg-[#2a2d38] border-r border-[#dee2e6] dark:border-[#3a3d48] shadow-sm z-20
          flex flex-col
          transition-transform duration-300 ease-in-out
          ${isOpen || mounted ? 'translate-x-0' : '-translate-x-full'}
          md:translate-x-0
        `}
      >
        {/* Logo / Brand */}
        <div className="p-5 border-b border-[#dee2e6] dark:border-[#3a3d48]">
          <div className="flex items-center">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-r from-indigo-600 via-purple-500 to-blue-500 flex items-center justify-center mr-3 shadow-sm shrink-0">
              <BsRobot className="text-white" size={18} />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 via-purple-500 to-blue-500 truncate">DevOps AI Agents</h1>
              <p className="text-[11px] text-[#6c757d] dark:text-[#6a6a75]">AI-powered operations</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-3">
          <ul className="space-y-0.5">
            {menuItems.map((item) => (
              <li key={item.path}>
                <Link
                  href={item.path}
                  prefetch={true}
                  onClick={() => { setIsOpen(false); setNavigating(item.path); }}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                    pathname === item.path
                      ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 font-medium'
                      : 'text-[#6c757d] dark:text-[#a0a0aa] hover:bg-[#e9ecef] dark:hover:bg-[#353842] hover:text-[#212529] dark:hover:text-[#e8e8ed]'
                  }`}
                >
                  <span className={pathname === item.path ? 'text-indigo-600 dark:text-indigo-400' : 'text-[#adb5bd] dark:text-[#6a6a75]'}>
                    {navigating === item.path ? (
                      <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : item.icon}
                  </span>
                  <span>{item.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Bottom tip */}
        <div className="p-4 border-t border-[#dee2e6] dark:border-[#3a3d48]">
          <div className="p-3 rounded-lg bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-900/20 dark:to-blue-900/20 border border-indigo-100 dark:border-indigo-800/40">
            <div className="flex items-start gap-2">
              <BsLightbulb className="text-indigo-600 dark:text-indigo-400 mt-0.5 shrink-0" size={14} />
              <div>
                <p className="text-xs font-medium text-[#212529] dark:text-[#e8e8ed] mb-0.5">AI Assistant</p>
                <p className="text-[11px] text-[#6c757d] dark:text-[#6a6a75] leading-relaxed">Ask about DevOps pipelines, cloud infra, security & more</p>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
