import { useEffect, useRef } from 'react';

interface UseFocusTrapOptions {
  enabled?: boolean;
  returnFocus?: boolean;
  initialFocus?: string; // CSS selector for initial focus element
  escapeDeactivates?: boolean;
  onEscape?: () => void;
}

/**
 * Hook for trapping focus within a container element
 * Useful for modals, dialogs, and dropdown menus
 */
export const useFocusTrap = (
  containerRef: React.RefObject<HTMLElement>,
  options: UseFocusTrapOptions = {}
) => {
  const {
    enabled = true,
    returnFocus = true,
    initialFocus,
    escapeDeactivates = true,
    onEscape
  } = options;

  const previousActiveElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!enabled || !containerRef.current) return;

    const container = containerRef.current;
    
    // Store the currently focused element
    previousActiveElement.current = document.activeElement as HTMLElement;

    // Get all focusable elements
    const getFocusableElements = () => {
      const focusableSelectors = [
        'a[href]:not([disabled]):not([tabindex="-1"])',
        'button:not([disabled]):not([tabindex="-1"])',
        'textarea:not([disabled]):not([tabindex="-1"])',
        'input:not([disabled]):not([tabindex="-1"])',
        'select:not([disabled]):not([tabindex="-1"])',
        '[tabindex]:not([tabindex="-1"]):not([disabled])',
        '[contenteditable="true"]:not([disabled])'
      ].join(', ');

      return Array.from(
        container.querySelectorAll<HTMLElement>(focusableSelectors)
      ).filter(el => {
        // Check if element is visible
        return el.offsetParent !== null;
      });
    };

    // Set initial focus
    const setInitialFocus = () => {
      const focusableElements = getFocusableElements();
      
      if (initialFocus) {
        const initialElement = container.querySelector<HTMLElement>(initialFocus);
        if (initialElement && focusableElements.includes(initialElement)) {
          initialElement.focus();
          return;
        }
      }
      
      // Default to first focusable element
      if (focusableElements.length > 0) {
        focusableElements[0].focus();
      }
    };

    // Handle tab key
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && escapeDeactivates) {
        event.preventDefault();
        if (onEscape) {
          onEscape();
        }
        return;
      }

      if (event.key !== 'Tab') return;

      const focusableElements = getFocusableElements();
      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

      // Tab backwards
      if (event.shiftKey) {
        if (activeElement === firstElement || !container.contains(activeElement as Node)) {
          event.preventDefault();
          lastElement.focus();
        }
      } 
      // Tab forwards
      else {
        if (activeElement === lastElement || !container.contains(activeElement as Node)) {
          event.preventDefault();
          firstElement.focus();
        }
      }
    };

    // Add event listeners
    document.addEventListener('keydown', handleKeyDown);
    
    // Set initial focus after a small delay to ensure DOM is ready
    const focusTimeout = setTimeout(setInitialFocus, 50);

    // Cleanup
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      clearTimeout(focusTimeout);
      
      // Return focus to previous element
      if (returnFocus && previousActiveElement.current) {
        previousActiveElement.current.focus();
      }
    };
  }, [enabled, containerRef, initialFocus, escapeDeactivates, onEscape, returnFocus]);
};