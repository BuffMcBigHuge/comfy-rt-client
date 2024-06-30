import React, { useEffect, useRef, useState } from 'react';
import { GamepadsProvider, useGamepads, } from 'react-gamepads';
import { v4 as uuidv4 } from 'uuid';
import { FiPlay, FiPause, FiMaximize, FiMinimize, FiCamera, FiCreditCard, FiX, FiSettings } from "react-icons/fi";

import Button from './components/Button';
import { useToast } from './components/Toast';
import { useOnPressThrottle } from './hooks/throttleHook';
import useFrameBuffer from './hooks/FrameBufferHook';

import { storage, ref, uploadBytes } from '../firebase';
import ComfyUI from '../comfy';
import models from '../models';

const Main = () => {
  const COMFY_SERVER_URL_4090 = 'http://10.0.0.4:8188';
  const COMFY_SERVER_URL_4080 = 'http://10.0.0.3:8188';
  // const COMFY_SERVER_URL_3080 = 'http://10.0.0.4:8189';

  const queueComfy4090 = useRef(() => {});
  const timeRef4090 = useRef(0);

  const queueComfy4080 = useRef(() => {});
  const timeRef4080 = useRef(0);

  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isPaused, setIsPaused] = useState(true);
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

  // Parameters
  const modelOptions = useRef(models.models);

  const [modelSelected, setModelSelected] = useState(JSON.parse(localStorage.getItem('modelSelected')) || modelOptions.current[0]);
  const modelSelectedRef = useRef(modelSelected);
  const [prompt, setPrompt] = useState(localStorage.getItem('prompt') || 'Cambodia');
  const promptRef = useRef(prompt);
  const [denoise, setDenoise] = useState(localStorage.getItem('denoise') || 0.5);
  const denoiseRef = useRef(denoise);
  const [steps, setSteps] = useState(localStorage.getItem('steps') || 2);
  const stepsRef = useRef(steps);

  // Handle Model/Prompt/Denoise changes
  useEffect(() => {
    console.log('Model/Prompt/Denoise changed:', modelSelected, prompt, denoise);
    modelSelectedRef.current = modelSelected;
    promptRef.current = prompt;
    denoiseRef.current = denoise;
    stepsRef.current = steps;
    localStorage.setItem('steps', steps);
    localStorage.setItem('prompt', prompt);
    localStorage.setItem('modelSelected', JSON.stringify(modelSelected));
    localStorage.setItem('denoise', denoise);
  }, [modelSelected, prompt, denoise, steps]);
  //
  
  const showToast = useToast();
  const { onFrameReceived, outputImageRef, startPlayback, stopPlayback, getTargetFrameRate } = useFrameBuffer();

  // Create Ref of getTargetFrameRate
  const getTargetFrameRateRef = useRef(getTargetFrameRate);

  useEffect(() => {
    if (initialized) return;
    setInitialized(true);

    console.log('Starting ComfyUI RT Client...');

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
      })
      .catch((error) => console.error('Error:', error));

    const initializeComfyUI = (GPU, URL, queueComfy) => {
      console.log(`Initializing ComfyUI on GPU ${GPU}...`);

      queueComfy.current = async () => {
        if (isPausedRef.current) return;

        const response = await comfy.queue({
          ...modelSelectedRef.current,
          workflow,
          workflowAPI,
          steps: stepsRef.current,
          prompt: promptRef.current,
          denoise: denoiseRef.current,
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
          denoise: ['213'],
          steps: ['213'],
          prompts: ['6'],
          vae: ['100'],
          ckpt_name: ['4'],
          base64_data: ['214'],
          api_save: ['204'],
          // Workflow 2
          // strength: ['224'],
          // lora_name: ['217'],
          // lora_name_detail: ['227'],
          // control_net_name: ['222'],
          // Workflow 1
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

    console.log(`Setting up canvas: ${canvas.width} x ${canvas.height}`);
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
  };

  const handleDenoiseChange = (event) => {
    setDenoise(event.target.value);
  };
  
  const handleStepChange = (event) => {
    setSteps(event.target.value);
  };

  const handleScreenShare = () => {
    setIsScreenSharing(!isScreenSharing);
  };

  const handleDeviceChange = () => {
    // Change the selected device
    const deviceId = devices.find(device => device.deviceId !== selectedDeviceId)?.deviceId;
    setSelectedDeviceId(deviceId);
  };

  const [gamepads, setGamepads] = useState({});
  useGamepads((gamepads) => setGamepads(gamepads));

  useEffect(() => {
    const defaultGamepad = Object.keys(gamepads).length > 0 ? gamepads[0] : {};
    if ('axes' in defaultGamepad) {
      const leftStickX = defaultGamepad.axes[0];
      const rightStickX = defaultGamepad.axes[2];

      if (leftStickX > 0.5) {
        throttledSetDenoise((prevDenoise) => {
          let newDenoise = Math.min(1, parseFloat(prevDenoise) + 0.01);
          newDenoise = Math.max(0.01, newDenoise);
          return newDenoise.toFixed(2);
        });
      } else if (leftStickX < -0.5) {
        throttledSetDenoise((prevDenoise) => {
          let newDenoise = Math.max(0.01, parseFloat(prevDenoise) - 0.01);
          return newDenoise.toFixed(2);
        });
      }
      if (rightStickX > 0.5) {
        throttledSetSteps((prevSteps) => {
          let newSteps = prevSteps + 1;
          newSteps = Math.min(5, newSteps); // Ensure newSteps does not exceed 5
          return newSteps;
        });
      } else if (rightStickX < -0.5) {
        throttledSetSteps((prevSteps) => {
          let newSteps = prevSteps - 1;
          newSteps = Math.max(1, newSteps); // Ensure newSteps does not go below 1
          return newSteps;
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
  }, 10);
  
  const throttledSetSteps = useOnPressThrottle((newSteps) => {
    setSteps(newSteps);
  }, 100);

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
        <img ref={outputImageRef} className="mx-auto my-auto full-image border-red-50" />
      ) : 'null'}
        <video
          onClick={handleDeviceChange}
          ref={videoRef}
          className="fixed right-0 top-0 w-48 h-36 z-50"
        ></video>
        <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>
      </div>
      <div className="fixed top-0 size-4 text-2xl text-white m-1">
        {isPaused ? 'Paused' : getTargetFrameRateRef.current()}
      </div>

      <div className="rounded-lg m-2 fixed bottom-0 left-0 right-0 bg-black bg-opacity-20 p-4 backdrop-filter backdrop-blur-lg items-center">
        <div className="flex flex-1 flex-row space-x-2">
          <input
            type="text"
            id="prompt"
            className="w-full p-2 rounded-md border-1 border-gray-300 bg-transparent text-gray-300"
            value={prompt}
            onChange={handlePromptChange}
            placeholder="Enter prompt"
            onFocus = {(e) => e.target.select()}
          />
          <Button
            id="pauseButton"
            variant="primary"
            size="md"
            onClick={handlePauseClick}
          >
            {isPaused ? <FiPlay /> : <FiPause />}
          </Button>
          <Button
            className=''
            id="fullscreenButton"
            variant="primary"
            size="md"
            onClick={handleFullscreenClick}
          >
            {isFullScreen ? <FiMinimize /> : <FiMaximize />}
          </Button>
          <Button
            className='hide-on-mobile'
            id="screenshareButton"
            variant="primary"
            size="md"
            onClick={handleScreenShare}
          >
            {isScreenSharing ? <FiCreditCard /> : <FiCamera />}
          </Button>
          <Button
            id="settingsButton"
            variant="primary"
            size="md"
            onClick={handleModal}
          >
            <FiSettings />
          </Button>
        </div>
        <div className="flex flex-row justify-between items-center space-x-2 w-full mt-2">
          <div className="flex flex-1 flex-col items-center">
            <label htmlFor="denoise" className="text-sm text-gray-500">
              Denoise ({denoise})
            </label>
            <input
              type="range"
              id="denoise"
              min="0.01"
              max="1"
              step="0.01"
              className="mt-2  mr-2 w-full h-4 appearance-none bg-transparent slider"
              value={denoise}
              onChange={handleDenoiseChange}
              onFocus={(e) => e.target.blur()}
            />
          </div>
          <div className="flex flex-1 flex-col items-center">
            <label htmlFor="denoise" className="text-sm text-gray-500">
              Steps ({steps})
            </label>
            <input
              type="range"
              id="steps"
              min="1"
              max="5"
              step="1"
              className="mt-2  mr-2 w-full h-4 appearance-none bg-transparent slider"
              value={steps}
              onChange={handleStepChange}
              onFocus={(e) => e.target.blur()}
            />
          </div>
          <div className="text-white text-center hide-on-mobile">          
            Left stick: Denoise
            <br />
            Center Pad: Save Image
            <br />
            Buttons: Prompt
          </div>
        </div>
      </div>

      {isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center">
          <div className="bg-white rounded-lg shadow-lg p-5">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">Settings</h2>
              <button onClick={handleModal} className="text-black">
                <FiX />
              </button>
            </div>
            <div className="mt-2">
              <label htmlFor="setting1" className="block mb-2">Model Selection</label>
              <select id="setting1" className="block w-full p-2 border border-gray-300 rounded" value={modelSelected.label} onChange={handleModelChange}>
                {modelOptions.current.map((model, index) => (
                  <option key={index} value={model.label}>{model.label}</option>
                ))}
              </select>
            </div>
            <div className="mt-2 flex justify-end">
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
