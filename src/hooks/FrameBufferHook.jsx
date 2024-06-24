import { useRef, useEffect } from 'react';

const useBufferedFrameDisplay = (targetFPS = 30) => {
    const outputImageRef = useRef(null);
    const frameBuffer = useRef([]);
    const requestRef = useRef();
    const lastFrameTime = useRef(Date.now());

    useEffect(() => {
        const displayNextFrame = () => {
            const currentTime = Date.now();
            // Check if there's a frame to display and if the current time is past the expected display time
            if (frameBuffer.current.length > 0 && currentTime >= frameBuffer.current[0].expectedDisplayTime) {
                const nextFrame = frameBuffer.current.shift().frame;
                if (outputImageRef.current) {
                    outputImageRef.current.src = nextFrame; // Display the frame
                }
                lastFrameTime.current = currentTime; // Update the last frame time
            }
            requestRef.current = requestAnimationFrame(displayNextFrame); // Continue the loop
        };

        requestRef.current = requestAnimationFrame(displayNextFrame); // Start the loop

        return () => cancelAnimationFrame(requestRef.current); // Cleanup on unmount
    }, [targetFPS]); // Dependency array

    const onFrameReceived = (newFrame) => {
        const frameInterval = 1000 / targetFPS;
        const currentTime = Date.now();
        const expectedDisplayTime = lastFrameTime.current + frameInterval;

        // Add the frame to the buffer if it's not too late to be displayed
        if (currentTime <= expectedDisplayTime || frameBuffer.current.length === 0) {
            frameBuffer.current.push({ frame: newFrame, expectedDisplayTime });
        }
    };

    return { onFrameReceived, outputImageRef };
};

export default useBufferedFrameDisplay;