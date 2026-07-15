'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BsShieldLock, BsGit, BsXCircle, BsEye, BsEyeSlash } from 'react-icons/bs';

interface CredentialModalProps {
  isOpen: boolean;
  type: 'sudo' | 'git';
  message: string;
  onSubmit: (credentials: Record<string, string>) => void;
  onCancel: () => void;
}

export default function CredentialModal({ isOpen, type, message, onSubmit, onCancel }: CredentialModalProps) {
  const [sudoPassword, setSudoPassword] = useState('');
  const [gitUsername, setGitUsername] = useState('');
  const [gitPassword, setGitPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (type === 'sudo') {
      onSubmit({ sudoPassword });
    } else {
      onSubmit({ gitUsername, gitPassword });
    }
  };

  const handleCancel = () => {
    setSudoPassword('');
    setGitUsername('');
    setGitPassword('');
    onCancel();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ duration: 0.2 }}
          >
            {/* Header */}
            <div className={`p-5 ${type === 'sudo' ? 'bg-gradient-to-r from-amber-600 to-orange-600' : 'bg-gradient-to-r from-gray-700 to-gray-800'} text-white`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="p-2 bg-white/15 rounded-lg mr-3">
                    {type === 'sudo' ? <BsShieldLock size={22} /> : <BsGit size={22} />}
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">
                      {type === 'sudo' ? 'Sudo Password Required' : 'Git Credentials Required'}
                    </h3>
                    <p className="text-sm text-white/80 mt-0.5">
                      {type === 'sudo'
                        ? 'This command requires administrative privileges'
                        : 'Authentication needed for Git operation'
                      }
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleCancel}
                  className="p-1 hover:bg-white/15 rounded-full transition-colors"
                >
                  <BsXCircle size={20} />
                </button>
              </div>
            </div>

            {/* Body */}
            <form onSubmit={handleSubmit} className="p-5">
              <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-sm text-gray-600">
                  <span className="font-medium text-gray-800">Command:</span>{' '}
                  {message.length > 80 ? message.slice(0, 80) + '...' : message}
                </p>
              </div>

              {type === 'sudo' ? (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={sudoPassword}
                      onChange={(e) => setSudoPassword(e.target.value)}
                      placeholder="Enter sudo password..."
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent text-sm pr-10"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <BsEyeSlash size={16} /> : <BsEye size={16} />}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-1.5">Password will be passed securely to the agent</p>
                </div>
              ) : (
                <>
                  <div className="mb-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Username
                    </label>
                    <input
                      type="text"
                      value={gitUsername}
                      onChange={(e) => setGitUsername(e.target.value)}
                      placeholder="Git username or email..."
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-transparent text-sm"
                      autoFocus
                    />
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Password / Token
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={gitPassword}
                        onChange={(e) => setGitPassword(e.target.value)}
                        placeholder="Git password or personal access token..."
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-transparent text-sm pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showPassword ? <BsEyeSlash size={16} /> : <BsEye size={16} />}
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-1.5">Use a personal access token instead of password for GitHub</p>
                  </div>
                </>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={type === 'sudo' ? !sudoPassword.trim() : !gitPassword.trim()}
                  className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors ${
                    type === 'sudo'
                      ? 'bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300'
                      : 'bg-gray-700 hover:bg-gray-800 disabled:bg-gray-400'
                  } disabled:cursor-not-allowed`}
                >
                  Submit
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
