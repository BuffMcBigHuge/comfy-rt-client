import React, { useEffect, useRef, useState } from 'react';
import { GamepadsProvider, useGamepads } from 'react-gamepads';
import { v4 as uuidv4 } from 'uuid';

import Button from './components/Button';
import { useToast } from './components/Toast';
import { useOnPressThrottle } from './hooks/throttleHook';
import useFrameBuffer from './hooks/FrameBufferHook';

import { storage, ref, uploadBytes } from '../firebase';
import ComfyUI from '../comfy';

const Main = () => {
  const COMFY_SERVER_URL_4090 = 'http://10.0.0.4:8188';
  const COMFY_SERVER_URL_4080 = 'http://10.0.0.3:8188';
  // const COMFY_SERVER_URL_3080 = 'http://10.0.0.4:8189';

  const queueComfy = useRef(() => {});
  const queueComfy2 = useRef(() => {});
  const queueComfy3 = useRef(() => {});

  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [isPaused, setIsPaused] = useState(true);
  const [prompt, setPrompt] = useState('');
  const [denoise, setDenoise] = useState(0.5);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const isPausedRef = useRef(isPaused);
  const [orderedPromptIds, setOrderedPromptIds] = useState([]);
  const orderedPromptIdsRef = useRef(orderedPromptIds);
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');

  useEffect(() => {
    orderedPromptIdsRef.current = orderedPromptIds;
  }, [orderedPromptIds]);
  const initalizedRef = useRef(false);

  const showToast = useToast();
  const { onFrameReceived, outputImageRef } = useFrameBuffer();

  useEffect(() => {
    if (initalizedRef.current) return;
    initalizedRef.current = true;

    console.log('Starting ComfyUI RT Client...');

    // Load Prompt/Denoise from Cookie
    const loadCookieValue = (name) => {
      const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
      if (match) return match[2];
      return null;
    };
    setPrompt(loadCookieValue('prompt') || handlePromptChange({ target: { value: '0.5'}}));
    setDenoise(loadCookieValue('denoise') || handleDenoiseChange({ target: { value: '0.5'}}));

    // Setup Canvas
    const canvas = canvasRef.current;
    const aspectRatio = window.innerWidth / window.innerHeight;

    canvas.height = Math.max(512, Math.min(1024, window.innerHeight));
    canvas.width = Math.max(512, Math.min(1024, window.innerWidth));
    if (canvas.width > canvas.height) {
      canvas.height = canvas.width / aspectRatio;
    } else {
      canvas.width = canvas.height * aspectRatio;
    }
    canvas.width = Math.max(512, Math.min(1024, canvas.width));
    canvas.height = Math.max(512, Math.min(1024, canvas.height));

    // Test
    // canvas.height = 1216;
    // canvas.width = 896;

    // Load Workflow
    let workflow, workflowAPI;
    fetch('./workflows/workflow.json')
      .then((response) => response.json())
      .then((data) => {
        workflow = data;
        return fetch('./workflows/workflow_api.json');
      })
      .then((response) => response.json())
      .then((data) => {
        workflowAPI = data;
        initializeComfyUI('4090', COMFY_SERVER_URL_4090, queueComfy);
        // initializeComfyUI('4080', COMFY_SERVER_URL_4080, queueComfy2);
        // initializeComfyUI('3080', COMFY_SERVER_URL_3080, queueComfy3);
      })
      .catch((error) => console.error('Error:', error));

    const initializeComfyUI = (GPU, URL, queueComfy) => {
      console.log(`Initializing ComfyUI on GPU ${GPU}...`);

      queueComfy.current = async () => {
        if (isPausedRef.current) return;

        // Retrieve Denoise/Prompt from Cookie
        const prompt = loadCookieValue('prompt');
        const denoise = parseFloat(loadCookieValue('denoise')).toFixed(1);

        const response = await comfy.queue({
          workflow,
          workflowAPI,
          prompt,
          denoise,
          base64_data: captureFrame(),
          unet_name: GPU === '4090' ?
            'wildcardxlfusion_hyper_4090_$dyn-b-1-1-1-h-512-1024-512-w-512-1024-512_00001_.engine' :
            'wildcardxlfusion_hyper_4080_$dyn-b-1-2-1-h-512-1024-512-w-512-1024-512_00001_.engine'
            // 'wildcardxlfusion_hyper_4090_$dyn-b-1-2-1-h-1216-1216-1216-w-896-896-896_00001_.engine' :
            // 'wildcardxlfusion_hyper_4080_$dyn-b-1-2-1-h-1216-1216-1216-w-896-896-896_00001_.engine'
            // 'wildcardxlfusion_hyper_$dyn-b-1-1-1-h-512-1024-512-w-512-1024-512_00001_.engine' :
            // (GPU === '4080' ? 'wildcardxlfusion_hyper_4080_$dyn-b-1-2-1-h-512-1024-512-w-512-1024-512_00001_.engine' :
            // 'wildcardxlfusion_hyper_3080_$dyn-b-1-2-1-h-512-1024-512-w-512-1024-512_00001_.engine'),
        });
        setOrderedPromptIds(prevIds => [...prevIds, response.prompt_id]);
      };

      const comfy = new ComfyUI({
        comfyUIServerURL: URL,
        nodes: {
          seeds: ['213'],
          prompts: ['6'],
          denoise: ['213'],
          base64_data: ['214'],
          api_save: ['204'],
          unet_name: ['151'],
        },
        onSaveCallback: async (message, promptId) => {
          // Determine the index of the current promptId in the ordered list
          const index = orderedPromptIdsRef.current.indexOf(promptId);
          onFrameReceived(message, index, GPU);
        },
        onQueueCallback: () => {
          queueComfy.current();
        },
      });

      queueComfy.current();
    };

    const captureFrame = () => {
      if (!canvasRef.current || !videoRef.current) return;

      const canvas = canvasRef.current;
      const video = videoRef.current;
      const context = canvas.getContext('2d');

      // Draw the current video frame onto the canvas
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Optionally, return the current frame's data URL
      return canvas.toDataURL('image/png').replace('data:image/png;base64,', '');
    };

  }, [onFrameReceived]);
  
  useEffect(() => {
    // Initialize devices and start media

    const initializeDevices = async () => {
      const getDevices = async () => {
        if (navigator.mediaDevices?.enumerateDevices) {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const videoDevices = devices.filter(device => device.kind === 'videoinput');
          setDevices(videoDevices);

          if (!selectedDeviceId && videoDevices.length > 0) {
            setSelectedDeviceId(videoDevices[0].deviceId);
          }
        }
      };
      await getDevices();
      startMedia();
    };

    const startMedia = async () => {
      console.log('Starting media...');

      if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.srcObject.getTracks().forEach((track) => track.stop());
      }

      const mediaPromise = isScreenSharing
        ? navigator.mediaDevices.getDisplayMedia({ video: true })
        : navigator.mediaDevices.getUserMedia({ 
          video: {
            deviceId: { exact: selectedDeviceId },
            facingMode: { ideal: 'environment' },
          },
         });

      mediaPromise
        .then((stream) => {
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play();
          }
        })
        .catch((err) => {
          console.error('An error occurred: ' + err);
        });
    };

    initializeDevices();
  }, [isScreenSharing, selectedDeviceId]);

  const handlePauseClick = () => {
    const newPauseState = !isPausedRef.current;
    setIsPaused(newPauseState);
    isPausedRef.current = newPauseState;
    if (!newPauseState) {
      if (queueComfy.current) {
        queueComfy.current();
      }
      if (queueComfy2.current) {
        queueComfy2.current();
      }
      if (queueComfy3.current) {
        queueComfy3.current();
      }
    }
  };

  const handleFullscreenClick = () => {
    setIsFullScreen(!isFullScreen);
    if (document.fullscreenElement) {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.mozCancelFullScreen) {
        document.mozCancelFullScreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      } else if (document.msExitFullscreen) {
        document.msExitFullscreen();
      }
    } else {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen();
      } else if (document.documentElement.mozRequestFullScreen) {
        document.documentElement.mozRequestFullScreen();
      } else if (document.documentElement.webkitRequestFullscreen) {
        document.documentElement.webkitRequestFullscreen();
      } else if (document.documentElement.msRequestFullscreen) {
        document.documentElement.msRequestFullscreen();
      }
    }
  };

  const handlePromptChange = (event) => {
    setPrompt(event.target.value);
    document.cookie = `prompt=${event.target.value}; path=/`;
  };

  const handleDenoiseChange = (event) => {
    setDenoise(event.target.value);
    document.cookie = `denoise=${event.target.value}; path=/`;
  };

  const handleScreenShare = () => {
    setIsScreenSharing(!isScreenSharing);
  };

  const handleDeviceChange = () => {
    // Change the selected device
    const deviceId = devices.find(device => device.deviceId !== selectedDeviceId)?.deviceId;
    setSelectedDeviceId(deviceId);
  };

  const gamepads = useGamepads(gamepads => setGamepads(gamepads));

  const prompts = [
    'mexico city',
    'phnom penh',
    'tokyo',
    'new york',
    'paris',
    'london',
    'rome',
    'berlin',
    'los angeles',
    'san francisco',
    'sydney',
    'toronto',
    'barcelona',
    'mumbai',
    'beijing',
    'cairo',
    'buenos aires',
  ];

  const throttledSetDenoise = useOnPressThrottle((newDenoise) => {
    setDenoise(newDenoise);
  }, 1);

  const throttleScreenshot = useOnPressThrottle(() => {
    const imgSrc = outputImageRef.current;
    if (!imgSrc) {
      console.error('Image source not found');
      return;
    }

    fetch(imgSrc)
      .then(response => {
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        return response.blob();
      })
      .then(blob => {
        const storageRef = ref(storage, `screenshots/${uuidv4()}.png`);
        uploadBytes(storageRef, blob).then((snapshot) => {
          showToast('Screenshot saved!');
        });
      })
      .catch(error => console.error('Error fetching and converting image:', error));
  }, 1000);

  useEffect(() => {
    const defaultGamepad = Object.keys(gamepads).length > 0 ? gamepads[0] : {};
    if ('axes' in defaultGamepad) {
      const leftStickX = defaultGamepad.axes[0];
      const leftStickY = defaultGamepad.axes[1];

      if (leftStickX > 0.5) {
        throttledSetDenoise((prevDenoise) => {
          let newDenoise = Math.min(1, parseFloat(prevDenoise) + 0.01);
          newDenoise = Math.max(0.01, newDenoise);
          document.cookie = `denoise=${newDenoise}; path=/`;
          return newDenoise.toFixed(2);
        });
      } else if (leftStickX < -0.5) {
        throttledSetDenoise((prevDenoise) => {
          let newDenoise = Math.max(0.01, parseFloat(prevDenoise) - 0.01);
          document.cookie = `denoise=${newDenoise}; path=/`;
          return newDenoise.toFixed(2);
        });
      }
    }
    if ('buttons' in defaultGamepad) {
      defaultGamepad.buttons.forEach((button, index) => {
        if (button.pressed) {
          if (index === 17) {
            throttleScreenshot();
          } else {
            const newPrompt = prompts[index];
            document.cookie = `prompt=${newPrompt}; path=/`;
            setPrompt(newPrompt);
            return newPrompt;
          }
        }
      });
    }
  }, [gamepads]);

  return (
    <div>
      <div onClick={throttleScreenshot}>
      {outputImageRef ? (
        <img ref={outputImageRef} alt={outputImageRef.current} className="mx-auto my-4" />
      ) : 'null'}
        <video
          onClick={handleDeviceChange}
          ref={videoRef}
          className="fixed right-0 top-5 w-48 h-36 z-50"
        ></video>
        <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-black bg-opacity-20 p-4 backdrop-filter backdrop-blur-lg items-center">
        <div className="flex flex-row">
          <input
            type="text"
            id="prompt"
            className="w-full p-2 rounded-md border-1 border-gray-300 bg-transparent text-gray-300"
            value={prompt}
            onChange={handlePromptChange}
            placeholder="Enter prompt"
          />
        </div>
        <div className="flex flex-row justify-between items-center space-x-4 w-full">
          <div className="flex flex-1 flex-col items-center">
            <label htmlFor="denoise" className="text-sm text-gray-300">
              Denoise
            </label>
            <input
              type="range"
              id="denoise"
              min="0.01"
              max="1"
              step="0.01"
              className="mt-2 w-full h-2 appearance-none bg-transparent slider"
              value={denoise}
              onChange={handleDenoiseChange}
              onFocus={(e) => e.target.blur()}
            />
          </div>
          <Button
            id="pauseButton"
            variant="primary"
            size="md"
            onClick={handlePauseClick}
          >
            {isPaused ? 'Resume' : 'Pause'}
          </Button>
          <Button
            className='hide-on-mobile'
            id="fullscreenButton"
            variant="primary"
            size="md"
            onClick={handleFullscreenClick}
          >
            {isFullScreen ? 'Exit Full Screen' : 'Go Full Screen'}
          </Button>
          <Button
            className='hide-on-mobile'
            id="screenshareButton"
            variant="primary"
            size="md"
            onClick={handleScreenShare}
          >
            {isScreenSharing ? 'Screen' : 'Webcam'}
          </Button>
          <div className="text-white text-center hide-on-mobile">          
            Left stick: Denoise
            <br />
            Center Pad: Save Image
            <br />
            Buttons: Prompt
          </div>
        </div>
      </div>
    </div>
  );
};

export default Main;
