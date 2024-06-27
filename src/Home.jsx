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

  const queueComfy4090 = useRef(() => {});
  const timeRef4090 = useRef(0);

  const queueComfy4080 = useRef(() => {});
  const timeRef4080 = useRef(0);

  const queueComfy3080 = useRef(() => {});
  const timeRef3080 = useRef(0);

  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isPaused, setIsPaused] = useState(true);
  const [prompt, setPrompt] = useState('');
  const [denoise, setDenoise] = useState(0.5);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [orderedPromptIds, setOrderedPromptIds] = useState([]);
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [initialized, setInitialized] = useState(false);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const isPausedRef = useRef(isPaused);
  const orderedPromptIdsRef = useRef(orderedPromptIds);
  useEffect(() => {
    orderedPromptIdsRef.current = orderedPromptIds;
  }, [orderedPromptIds]);

  // Models
  const modelOptions = useRef([
    {
      model4080: 'pixel_hyper_4080_$dyn-b-1-2-1-h-896-1216-1216-w-896-1216-1216_00001_.engine',
      model4090: 'pixel_hyper_4090_$dyn-b-1-2-1-h-896-1216-1216-w-896-1216-1216_00001_.engine',
      label: 'Pixel Alchemy (896/1216)',
      model_type: 'sdxl_base',
      vae: 'taesdxl',
      model: 'sdxl\\pixelAlchemy_pixelAlchemyV16.safetensors',
      min: 896,
      max: 1216,
    }, 
    {
      model4080: 'wildcardxlfusion_hyper_4080_$dyn-b-1-2-1-h-896-1216-1216-w-896-1216-1216_00001_.engine',
      model4090: 'wildcardxlfusion_hyper_4090_$dyn-b-1-2-1-h-896-1216-1216-w-896-1216-1216_00001_.engine',
      label: 'Wildcard Fusion XL (896/1216)',
      model_type: 'sdxl_base',
      vae: 'taesdxl',
      model: 'sdxl\\wildcardxXLFusion_fusionOG.safetensors',
      min: 896,
      max: 1216,
    },
    {
      model4080: 'wildcardfusionxl_hyper_4080_$dyn-b-1-2-1-h-512-1024-1024-w-512-1024-1024_00001_.engine',
      model4090: 'wildcardxlfusion_hyper_4090_$dyn-b-1-2-1-h-512-1024-1024-w-512-1024-1024_00001_.engine',
      label: 'Wildcard Fusion XL (512/1024)',
      model_type: 'sdxl_base',
      vae: 'taesdxl',
      model: 'sdxl\\wildcardxXLFusion_fusionOG.safetensors',
      min: 512,
      max: 1024,
    },
    {
      model4080: '11_hyper_4080_$dyn-b-1-2-1-h-512-1024-1024-w-512-1024-1024_00001_.engine',
      model4090: '11_hyper_4090_$dyn-b-1-2-1-h-512-1024-1024-w-512-1024-1024_00001_.engine',
      label: '11 (512/1024)',
      model_type: 'sd1.x',
      vae: 'taesd',
      model: 'sd15\\11.safetensors',
      min: 512,
      max: 1024,
    },
    {
      model4080: 'dreamshaper_hyper_4080_$dyn-b-1-2-1-h-512-1024-1024-w-512-1024-1024_00001_.engine',
      model4090: 'dreamshaper_hyper_4090_$dyn-b-1-2-1-h-512-1024-1024-w-512-1024-1024_00001_.engine',
      label: 'Dreamshaper (512/1024)',
      model_type: 'sd1.x',
      vae: 'taesd',
      model: 'sd15\\dreamshaper_8.safetensors',
      min: 512,
      max: 1024,
    },
  ]);
  const [modelSelected, setModelSelected] = useState(modelOptions.current[0]);
  const modelSelectedRef = useRef(modelSelected);
  useEffect(() => {
    modelSelectedRef.current = modelSelected;
  }, [modelSelected]);
  //
  
  const showToast = useToast();
  const { onFrameReceived, outputImageRef, startPlayback, stopPlayback, getTargetFrameRate } = useFrameBuffer();

  // Create Ref of getTargetFrameRate
  const getTargetFrameRateRef = useRef(getTargetFrameRate);

  useEffect(() => {
    if (initialized) return;
    setInitialized(true);

    console.log('Starting ComfyUI RT Client...');

    // Load Prompt/Denoise from Cookie
    const loadCookieValue = (name) => {
      const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
      if (match) return match[2];
      return null;
    };
    setPrompt(loadCookieValue('prompt') || handlePromptChange({ target: { value: 'Cool'}}));
    setDenoise(loadCookieValue('denoise') || handleDenoiseChange({ target: { value: '0.5'}}));

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
        initializeComfyUI('4090', COMFY_SERVER_URL_4090, queueComfy4090);
        initializeComfyUI('4080', COMFY_SERVER_URL_4080, queueComfy4080);
        // initializeComfyUI('3080', COMFY_SERVER_URL_3080, queueComfy3080);
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
          checkpoint: modelSelectedRef.current.model,
          vae: modelSelectedRef.current.vae,
          model_type: modelSelectedRef.current.model_type,
          base64_data: captureFrame(),
          unet_name: GPU === '4090' ?
            modelSelectedRef.current.model4090 :
            modelSelectedRef.current.model4080,
        });
        setOrderedPromptIds(prevIds => [...prevIds, response.prompt_id]);
      };
      
      const comfy = new ComfyUI({
        comfyUIServerURL: URL,
        nodes: {
          seeds: ['213'],
          prompts: ['6'],
          denoise: ['213'],
          vae: ['100'],
          checkpoint: ['4'],
          base64_data: ['214'],
          api_save: ['204'],
          unet_name: ['151'],
          model_type: ['151'],
        },
        onSaveCallback: async (message, promptId) => {
          // Determine the index of the current promptId in the ordered list
          const index = orderedPromptIdsRef.current.indexOf(promptId);
          onFrameReceived(message, index, GPU);

          if (GPU === '4090') {
            timeRef4090.current = Date.now().valueOf();
            // console.log(`Received frame from GPU ${GPU} in ${timeRef4090.current - timeRef4080.current}ms`);
          } else if (GPU === '4080') {
            timeRef4080.current = Date.now().valueOf();
            // console.log(`Received frame from GPU ${GPU} in ${timeRef4080.current - timeRef4090.current}ms`);
          }
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
    
      // Calculate the aspect ratio of the video
      const videoAspectRatio = video.videoWidth / video.videoHeight;
    
      // Calculate the target dimensions to maintain aspect ratio
      let targetWidth, targetHeight;
      if (canvas.width / videoAspectRatio <= canvas.height) {
        targetWidth = canvas.width;
        targetHeight = canvas.width / videoAspectRatio;
      } else {
        targetWidth = canvas.height * videoAspectRatio;
        targetHeight = canvas.height;
      }
    
      // Calculate offsets to center the image
      const offsetX = (canvas.width - targetWidth) / 2;
      const offsetY = (canvas.height - targetHeight) / 2;
    
      // Clear the canvas and draw the video frame with aspect ratio maintained
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(video, offsetX, offsetY, targetWidth, targetHeight);
    
      // Optionally, return the current frame's data URL
      return canvas.toDataURL('image/png').replace('data:image/png;base64,', '');
    };

    return () => {
      // Cleanup function
    };
  }, []);
  
  useEffect(() => {
    console.log('Setting up canvas...');

    const min = modelSelected.min;
    const max = modelSelected.max;
    const canvas = canvasRef.current;
    const aspectRatio = window.innerWidth / window.innerHeight;

    // Initial dimensions within min/max constraints
    let width = Math.max(min, Math.min(max, window.innerWidth));
    let height = Math.max(min, Math.min(max, window.innerHeight));

    // Adjust dimensions based on aspect ratio
    if (width > height) {
      height = Math.min(Math.max(min, width / aspectRatio), max);
    } else {
      width = Math.min(Math.max(min, height * aspectRatio), max);
    }

    // Ensure final dimensions are within min/max constraints
    width = Math.max(min, Math.min(max, width));
    height = Math.max(min, Math.min(max, height));

    // Apply final dimensions
    canvas.width = width;
    canvas.height = height;

    console.log(canvas.width, canvas.height);
  }, [modelSelected]);

  useEffect(() => {
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
            deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
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
      startPlayback();
      if (queueComfy4090.current) {
        queueComfy4090.current();
      }
      if (queueComfy4080.current) {
        queueComfy4080.current();
      }
      if (queueComfy3080.current) {
        queueComfy3080.current();
      }
    }
    else {
      stopPlayback();
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

  // Settings Modal
  const [isOpen, setIsOpen] = useState(false);

  const handleModal = () => setIsOpen(!isOpen);

  function handleModelChange(event) {
    const modelSelected = modelOptions.current.find((model) => model.label === event.target.value);
    setModelSelected(modelSelected);
  }

  return (
    <div>
      <div onClick={throttleScreenshot}>
      {outputImageRef ? (
        <img ref={outputImageRef} className="mx-auto my-auto full-image" />
      ) : 'null'}
        <video
          onClick={handleDeviceChange}
          ref={videoRef}
          className="fixed right-0 top-5 w-48 h-36 z-50"
        ></video>
        <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>
      </div>
      <div className="fixed top-0 size-4 text-2xl text-white m-1">
        {getTargetFrameRateRef.current()}
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
            onFocus = {(e) => e.target.select()}
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
            className=''
            id="fullscreenButton"
            variant="primary"
            size="md"
            onClick={handleFullscreenClick}
          >
            {isFullScreen ? 'X' : 'FS'}
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
          <Button
            id="settingsButton"
            variant="primary"
            size="md"
            onClick={handleModal}
          >
            Settings
          </Button>
        </div>
      </div>
      {isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center">
          <div className="bg-white rounded-lg shadow-lg p-5">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">Settings</h2>
              <button onClick={handleModal} className="text-black">&times;</button>
            </div>
            <div className="mt-4">
              <label htmlFor="setting1" className="block mb-2">Model Selection</label>
              <select id="setting1" className="block w-full p-2 border border-gray-300 rounded" value={modelSelected.label} onChange={handleModelChange}>
                {modelOptions.current.map((model, index) => (
                  <option key={index} value={model.label}>{model.label}</option>
                ))}
              </select>
            </div>
            <div className="mt-4 flex justify-end">
              <button onClick={handleModal} className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-700">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      
    </div>
  );
};

export default Main;
