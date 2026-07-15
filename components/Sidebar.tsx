'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

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
        className="fixed top-3 left-3 z-30 p-2 rounded-lg bg-white shadow-md border border-gray-200 text-gray-600 md:hidden hover:bg-gray-50 transition-all"
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? <BsX size={20} /> : <BsList size={20} />}
      </button>

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 h-full w-64 bg-white border-r border-gray-200 shadow-sm z-20
          flex flex-col
          transition-transform duration-300 ease-in-out
          ${isOpen || mounted ? 'translate-x-0' : '-translate-x-full'}
          md:translate-x-0
        `}
      >
        {/* Logo / Brand */}
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-center">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-r from-indigo-600 via-purple-500 to-blue-500 flex items-center justify-center mr-3 shadow-sm shrink-0">
              <BsRobot className="text-white" size={18} />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 via-purple-500 to-blue-500 truncate">DevOps AI Agents</h1>
              <p className="text-[11px] text-gray-400">AI-powered operations</p>
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
                  onClick={() => setIsOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                    pathname === item.path
                      ? 'bg-indigo-50 text-indigo-700 font-medium'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <span className={pathname === item.path ? 'text-indigo-600' : 'text-gray-400'}>{item.icon}</span>
                  <span>{item.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Bottom tip */}
        <div className="p-4 border-t border-gray-100">
          <div className="p-3 rounded-lg bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-100">
            <div className="flex items-start gap-2">
              <BsLightbulb className="text-indigo-600 mt-0.5 shrink-0" size={14} />
              <div>
                <p className="text-xs font-medium text-gray-800 mb-0.5">AI Assistant</p>
                <p className="text-[11px] text-gray-500 leading-relaxed">Ask about DevOps pipelines, cloud infra, security & more</p>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
