import { useRef, useEffect } from 'react';

const useBufferedFrameDisplay = (initialTargetFPS = 24) => {
  const outputImageRef = useRef(null);
  const frameBuffer = useRef([]);
  const requestRef = useRef();
  const lastFrameTime = useRef(Date.now());
  const lastFrameIndex = useRef(1);
  const gpuFrameTimings = useRef([]);
  const targetFPS = useRef(initialTargetFPS);
  const frameDropCount = useRef(0);
  const maxFrameDrop = 5;
  const frameInterval = 1000 / initialTargetFPS;
  const fallbackTimeout = 1000; // Fallback to avoid extended black screens

  const displayNextFrame = () => {
    const currentTime = Date.now();

    if (frameBuffer.current.length > 0) {
      const nextFrame = frameBuffer.current[0];

      if (currentTime >= nextFrame.expectedDisplayTime) {
        if (nextFrame.index === lastFrameIndex.current + 1 || frameDropCount.current == maxFrameDrop) {
          frameDropCount.current = 0;
          lastFrameIndex.current = nextFrame.index;
          lastFrameTime.current = currentTime;
          frameBuffer.current.shift();
          if (outputImageRef.current) {
            outputImageRef.current.src = nextFrame.frame;
          }
          console.log('Frame displayed:', nextFrame.index);
        } else if (nextFrame.index > lastFrameIndex.current + 1) {
          // Frame dropped
          frameDropCount.current++;
          console.warn('Frame dropped:', nextFrame.index);
          // frameBuffer.current.shift();
        } else {
          // Frame already displayed
          console.warn('Frame already displayed:', nextFrame.index);
          frameBuffer.current.shift();
        }
      }
    } else if (currentTime - lastFrameTime.current > fallbackTimeout) {
      // Fallback to avoid black screens
      console.warn('Fallback triggered');
      lastFrameTime.current = currentTime;
    }

    requestRef.current = requestAnimationFrame(displayNextFrame);
  };

  const onFrameReceived = (newFrame, index) => {
    const currentTime = Date.now();
    const expectedDisplayTime = lastFrameTime.current + frameInterval;
    const frameObject = { frame: newFrame, expectedDisplayTime, index };

    // Insert the frame into the buffer, ensuring correct order and no duplicates
    const insertAt = frameBuffer.current.findIndex(f => f.index > index);
    if (insertAt === -1) {
      frameBuffer.current.push(frameObject);
    } else {
      frameBuffer.current.splice(insertAt, 0, frameObject);
    }

    gpuFrameTimings.current.push(currentTime - lastFrameTime.current);
    if (gpuFrameTimings.current.length > 10) gpuFrameTimings.current.shift();

    // Adjust target FPS if needed
    if (gpuFrameTimings.current.length === 10) {
      const averageFrameTiming = getAverageFrameTiming();
      let newTargetFPS = Math.min(60, Math.floor(1000 / averageFrameTiming));
      newTargetFPS = Math.max(newTargetFPS, 1) + 1;
      if (newTargetFPS !== targetFPS.current) {
        targetFPS.current = newTargetFPS;
      }
    }
  };

  const getAverageFrameTiming = () => {
    const timings = gpuFrameTimings.current;
    if (timings.length === 0) return 0;
    return timings.reduce((acc, curr) => acc + curr, 0) / timings.length;
  };

  const getTargetFrameRate = () => targetFPS.current;

  const startPlayback = () => {
    frameBuffer.current = [];
    gpuFrameTimings.current = [];
    lastFrameTime.current = Date.now();

    if (requestRef.current) {
      cancelAnimationFrame(requestRef.current);
    }
    requestRef.current = requestAnimationFrame(displayNextFrame);
  };

  const stopPlayback = () => {
    if (requestRef.current) {
      cancelAnimationFrame(requestRef.current);
      requestRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      stopPlayback();
    };
  }, []);

  return { onFrameReceived, outputImageRef, startPlayback, stopPlayback, getTargetFrameRate };
};

export default useBufferedFrameDisplay;