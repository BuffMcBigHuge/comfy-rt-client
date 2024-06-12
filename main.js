window.addEventListener('load', () => {
    const COMFY_SERVER_URL = 'http://10.0.0.4:8188';

    let isPaused = false;
    let previousFrame = null;

    // Set prompt and denoise values from cookies
    document.getElementById('prompt').value = document.cookie.replace(/(?:(?:^|.*;\s*)prompt\s*\=\s*([^;]*).*$)|^.*$/, "$1");
    document.getElementById('denoise').value = document.cookie.replace(/(?:(?:^|.*;\s*)denoise\s*\=\s*([^;]*).*$)|^.*$/, "$1");

    console.log('Starting ComfyUI RT Client...')

    // Setup Canvas

    let video = document.createElement('video');
    video.classList.add('fixed', 'right-0', 'top-0', 'w-48', 'h-36', 'z-50'); // Tailwind CSS classes
    let canvas = document.createElement('canvas');

    // Calculate the aspect ratio of the screen
    let aspectRatio = window.innerWidth / window.innerHeight;

    // Set the canvas width and height based on the aspect ratio
    canvas.height = Math.max(512, Math.min(1024, window.innerHeight));
    canvas.width = Math.max(512, Math.min(1024, window.innerWidth));

    // If the width is greater than the height, adjust the height based on the aspect ratio
    if (canvas.width > canvas.height) {
        canvas.height = canvas.width / aspectRatio;
    }

    // If the height is greater than the width, adjust the width based on the aspect ratio
    if (canvas.height > canvas.width) {
        canvas.width = canvas.height * aspectRatio;
    }

    // Ensure the width and height are within the range of 512 to 1024 pixels
    canvas.width = Math.max(512, Math.min(1024, canvas.width));
    canvas.height = Math.max(512, Math.min(1024, canvas.height));

    let context = canvas.getContext('2d');

    // Start the webcam

    navigator.mediaDevices.getUserMedia({ video: true })
        .then(stream => {
            video.srcObject = stream;
            video.play();
            document.body.appendChild(video); // Append the video element to the body
        })
        .catch(err => console.error('An error occurred: ' + err));

    let alpha = 1.0;
    let intervalId = null;
        
    function captureFrame() {
        // If there is a previous frame, draw it on the canvas
        if (previousFrame) {
            context.globalAlpha = alpha;
            context.drawImage(previousFrame, 0, 0, canvas.width, canvas.height);
        }
    
        // Draw the current frame with full opacity
        context.globalAlpha = 1.0;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
    
        // Store the current frame as the previous frame for the next capture
        previousFrame = new Image();
        previousFrame.src = canvas.toDataURL('image/png');
    
        // Start the blend effect
        if (intervalId) {
            clearInterval(intervalId); // Clear the previous interval if it exists
        }
        alpha = 1.0;
        intervalId = setInterval(() => {
            alpha -= 0.05; // Decrease alpha by 0.05 every 10ms
            if (alpha <= 0.0) {
                clearInterval(intervalId); // Stop the interval when alpha reaches 0.0
                alpha = 1.0; // Reset alpha
            }
        }, 10); // 0.2 seconds = 200ms, so 200ms / 0.05 = 10ms
    
        return canvas.toDataURL('image/png').replace('data:image/png;base64,', '');
    }

    // Setup Workflow

    let workflow, workflowAPI;

    fetch('./workflows/workflow.json')
        .then(response => response.json())
        .then(data => {
            workflow = data;
            return fetch('./workflows/workflow_api.json');
        })
        .then(response => response.json())
        .then(data => {
            workflowAPI = data;
            initializeComfyUI();
        })
        .catch(error => console.error('Error:', error));

    function initializeComfyUI() {
        // Setup queue function
        const queueComfy = () => {
            if (isPaused) return;

            // Get the prompt and denoise values from cookies
            let prompt = document.cookie.replace(/(?:(?:^|.*;\s*)prompt\s*\=\s*([^;]*).*$)|^.*$/, "$1");
            let denoise = document.cookie.replace(/(?:(?:^|.*;\s*)denoise\s*\=\s*([^;]*).*$)|^.*$/, "$1");
           
            // Queue the workflow
            comfy.queue({
                workflow,
                workflowAPI,
                prompt,
                // Convert string to number with 1 sig digit
                denoise: parseFloat(denoise).toFixed(1),
                base64_data: captureFrame(), // Latest webcam image frame
            });
        };

        // Setup init function
        const comfy = new ComfyUI({
            comfyUIServerURL: COMFY_SERVER_URL,
            nodes: {
                seeds: ['213'],
                prompts: ['6'],
                denoise: ['213'],
                base64_data: ['209'],
                api_save: ['204'], // Used on PreviewImage for displaying in callback
            },
            onSaveCallback: async (message) => {
                // Send Image Websocket Method
                document.getElementById('outputImage').src = message;

                /* 
                // PreviewImage Method
                const files = message.data.output.images || [].concat(message.data.output.gifs || []);
                if (files.length === 1) {
                    const file = files[0];
                    const imageURL = await comfy.getFile({
                        ...file,
                    });
                    document.getElementById('outputImage').src = imageURL;
                }
                */
            },
            onQueueCallback: () => {
                queueComfy();
            },
        });

        // Pause button
        document.getElementById('pauseButton').addEventListener('click', () => {
            isPaused = !isPaused;
            document.getElementById('pauseButton').textContent = isPaused ? 'Resume' : 'Pause';
            if (!isPaused) {
                queueComfy();
            }
        });

        // Fullscreen button
        document.getElementById('fullscreenButton').addEventListener('click', () => {
            if (document.documentElement.requestFullscreen) {
                document.documentElement.requestFullscreen();
            } else if (document.documentElement.mozRequestFullScreen) { // Firefox
                document.documentElement.mozRequestFullScreen();
            } else if (document.documentElement.webkitRequestFullscreen) { // Chrome, Safari and Opera
                document.documentElement.webkitRequestFullscreen();
            } else if (document.documentElement.msRequestFullscreen) { // IE/Edge
                document.documentElement.msRequestFullscreen();
            }
        });

        // Prompt Value
        document.getElementById('prompt').addEventListener('input', (event) => {
            document.cookie = `prompt=${event.target.value}; path=/`;
        });

        // Denoise Value
        document.getElementById('denoise').addEventListener('input', (event) => {
            document.cookie = `denoise=${event.target.value}; path=/`;
        });

        // Queue the first workflow
        queueComfy();
    }
})
