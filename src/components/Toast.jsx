import React, { createContext, useContext, useState } from 'react';

const ToastContext = createContext();

export const useToast = () => {
  return useContext(ToastContext);
};

export const ToastProvider = ({ children }) => {
  const [toast, setToast] = useState({ message: '', visible: false });

  const showToast = (message) => {
    setToast({ message, visible: true });
    setTimeout(() => {
      setToast({ message: '', visible: false });
    }, 3000); // Toast will disappear after 3 seconds
  };

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      {toast.visible && (
        <div className="fixed top-10 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-black text-white p-4 rounded-lg shadow-lg z-50">
          <div className="flex items-center">
            <div className="mr-2">{toast.message}</div>
            <button
              onClick={() => setToast({ message: '', visible: false })}
              className="text-gray-400 hover:text-gray-200"
            >
              ✖
            </button>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
};