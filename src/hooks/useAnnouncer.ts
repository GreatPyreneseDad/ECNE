import { useCallback, useEffect, useRef } from 'react';

type AnnouncementPriority = 'polite' | 'assertive';

interface UseAnnouncerReturn {
  announce: (message: string, priority?: AnnouncementPriority) => void;
}

/**
 * Hook for making screen reader announcements
 * Creates and manages ARIA live regions for accessibility
 */
export const useAnnouncer = (): UseAnnouncerReturn => {
  const politeRef = useRef<HTMLDivElement | null>(null);
  const assertiveRef = useRef<HTMLDivElement | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Create live regions if they don't exist
    if (!document.getElementById('announcer-polite')) {
      const politeDiv = document.createElement('div');
      politeDiv.id = 'announcer-polite';
      politeDiv.setAttribute('aria-live', 'polite');
      politeDiv.setAttribute('aria-atomic', 'true');
      politeDiv.className = 'sr-only';
      document.body.appendChild(politeDiv);
      politeRef.current = politeDiv;
    } else {
      politeRef.current = document.getElementById('announcer-polite') as HTMLDivElement;
    }

    if (!document.getElementById('announcer-assertive')) {
      const assertiveDiv = document.createElement('div');
      assertiveDiv.id = 'announcer-assertive';
      assertiveDiv.setAttribute('aria-live', 'assertive');
      assertiveDiv.setAttribute('aria-atomic', 'true');
      assertiveDiv.className = 'sr-only';
      document.body.appendChild(assertiveDiv);
      assertiveRef.current = assertiveDiv;
    } else {
      assertiveRef.current = document.getElementById('announcer-assertive') as HTMLDivElement;
    }

    // Cleanup function
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const announce = useCallback((message: string, priority: AnnouncementPriority = 'polite') => {
    const targetRef = priority === 'assertive' ? assertiveRef : politeRef;
    
    if (!targetRef.current) return;

    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Clear the region first to ensure the announcement is made
    targetRef.current.textContent = '';
    
    // Use a small delay to ensure the clear is processed
    setTimeout(() => {
      if (targetRef.current) {
        targetRef.current.textContent = message;
        
        // Clear the message after a delay to prepare for next announcement
        timeoutRef.current = setTimeout(() => {
          if (targetRef.current) {
            targetRef.current.textContent = '';
          }
        }, 1000);
      }
    }, 100);
  }, []);

  return { announce };
};