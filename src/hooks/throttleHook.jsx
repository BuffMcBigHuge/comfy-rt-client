// Custom hook to create a throttled function that only invokes the first callback within the specified delay period and ignores subsequent ones.
import { useRef, useCallback } from 'react';

export const useOnPressThrottle = (
  callback,
  delay = 500,
  waitingRef = null,
) => {
  let waitingRefObj = useRef(false);
  if (waitingRef) {
    waitingRefObj = waitingRef;
  }

  // Ref to keep track of whether we're waiting to allow another invocation.
  return useCallback(
    (...args) => {
      // If we are already waiting, do nothing.
      if (waitingRefObj.current) return;

      waitingRefObj.current = true;

      // Otherwise, invoke the callback and set the waiting flag.
      callback?.(...args);

      // Set up a timer to reset the waiting flag after the specified delay.
      setTimeout(() => {
        waitingRefObj.current = false;
      }, delay);
    },
    [callback, delay, waitingRefObj]
  ); // Dependencies for useCallback.
};