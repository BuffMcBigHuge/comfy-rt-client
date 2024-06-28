import { useRef, useEffect } from 'react';

const useBufferedFrameDisplay = (initialTargetFPS = 24) => {
    const outputImageRef = useRef(null);
    const frameBuffer = useRef([]);
    const requestRef = useRef();
    const lastFrameTime = useRef(Date.now());
    const gpuFrameTimings = useRef([]); 
    const targetFPS = useRef(initialTargetFPS);

    const displayNextFrame = () => {
        const currentTime = Date.now();
        if (frameBuffer.current.length > 0 && currentTime >= frameBuffer.current[0].expectedDisplayTime) {
            const nextFrame = frameBuffer.current.shift().frame;
            if (outputImageRef.current) {
                outputImageRef.current.src = nextFrame;
            }
            lastFrameTime.current = currentTime;
        }
        requestRef.current = requestAnimationFrame(displayNextFrame);
    };

    const onFrameReceived = (newFrame, index) => {
      const frameInterval = 1000 / targetFPS.current;
      const currentTime = Date.now();
      const expectedDisplayTime = lastFrameTime.current + frameInterval;
      const frameObject = { frame: newFrame, expectedDisplayTime, index };

      if (currentTime <= expectedDisplayTime || frameBuffer.current.length === 0) {
          const insertAt = frameBuffer.current.findIndex(f => f.index > index);
          if (insertAt === -1) {
              frameBuffer.current.push(frameObject);
          } else {
              frameBuffer.current.splice(insertAt, 0, frameObject);
          }

          gpuFrameTimings.current.push(currentTime - lastFrameTime.current);
          if (gpuFrameTimings.current.length > 5) gpuFrameTimings.current.shift();

          // console.log('Average frame timing', getAverageFrameTiming(), 'ms');

          if (gpuFrameTimings.current.length === 5) {
              const averageFrameTiming = getAverageFrameTiming();
              let newTargetFPS = Math.min(60, Math.floor(1000 / averageFrameTiming));
              newTargetFPS = Math.max(newTargetFPS, 1);
              if (newTargetFPS !== targetFPS.current) {
                  console.log('Adjusting target FPS to', newTargetFPS + 3);
                  targetFPS.current = newTargetFPS + 3;
              }
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
        cancelAnimationFrame(requestRef.current);
        requestRef.current = null;
    };

    return { onFrameReceived, outputImageRef, startPlayback, stopPlayback, getTargetFrameRate };
};

export default useBufferedFrameDisplay;
