import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface PopoutWindowProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

export default function PopoutWindow({ title, onClose, children }: PopoutWindowProps) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const externalWindow = useRef<Window | null>(null);

  // Store onClose in a mutable Ref to prevent re-opening window when parent re-renders
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    // Open a blank window
    const win = window.open('', '_blank', 'width=980,height=750,menubar=no,toolbar=no,location=no,status=no');
    if (!win) {
      alert("Popup blocker blocked the Popout View! Please allow popups for this domain.");
      onCloseRef.current();
      return;
    }

    externalWindow.current = win;

    // Set page parameters
    win.document.title = title;
    win.document.documentElement.style.height = '100%';
    win.document.body.className = 'h-full bg-[var(--ida-bg)] text-[var(--ida-text)] m-0 font-mono';

    // Copy stylesheet references, themes, and CSS variables from host document to the popout document
    const copyStyles = () => {
      // 1. Copy link styles
      Array.from(document.querySelectorAll('link[rel="stylesheet"]')).forEach(link => {
        win.document.head.appendChild(link.cloneNode(true));
      });

      // 2. Copy style tags (including Tailwind/Vite hot styles)
      Array.from(document.getElementsByTagName('style')).forEach(style => {
        win.document.head.appendChild(style.cloneNode(true));
      });

      // 3. Copy body & document element themes and classes
      win.document.documentElement.className = document.documentElement.className;
      win.document.body.className += ' ' + document.body.className;

      // 4. Copy parent CSS custom properties (variables) dynamically
      const parentStyles = window.getComputedStyle(document.documentElement);
      for (let i = 0; i < parentStyles.length; i++) {
        const key = parentStyles[i];
        if (key.startsWith('--')) {
          win.document.documentElement.style.setProperty(key, parentStyles.getPropertyValue(key));
        }
      }
    };

    copyStyles();

    // Establish MutationObserver to capture and sync dynamic styles injected by Vite/Tailwind in real-time
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeName === 'STYLE' || node.nodeName === 'LINK') {
              win.document.head.appendChild(node.cloneNode(true));
            }
          });
        }
      });
    });
    observer.observe(document.head, { childList: true, subtree: true });

    // Create mount division
    const appContainer = win.document.createElement('div');
    appContainer.className = 'webdasm-popout-container p-3 h-full box-border flex flex-col overflow-hidden bg-[var(--ida-bg)]';
    win.document.body.appendChild(appContainer);

    setContainer(appContainer);

    // Watch for window closure by the user manually
    const timer = setInterval(() => {
      if (win.closed) {
        clearInterval(timer);
        onCloseRef.current();
      }
    }, 500);

    return () => {
      clearInterval(timer);
      observer.disconnect();
      win.close();
    };
  }, [title]);

  return container ? createPortal(children, container) : null;
}
