// comfy.js
// A simple web wrapper around the ComfyUI API.

// Function to generate a random UUID
function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
  });
}

class ComfyUI {
  constructor({ comfyUIServerURL, nodes, onSaveCallback, onQueueCallback }) {
    console.log('Starting ComfyUI.');

    // Init
    this.comfyUI = null;
    this.clientId = uuidv4();
    this.nodes = nodes;
    this.queueRemaining = 0;
    this.imageURL = null;
    this.comfyUIServerURL = comfyUIServerURL;

    if (onSaveCallback) {
      this.onSaveCallback = onSaveCallback;
    }

    if (onQueueCallback) {
      this.onQueueCallback = onQueueCallback;
    }

    // Connect
    this.connect();
  }
  
  connect() {
    console.log('Connecting to ComfyUI server...');
    const socketURL = `${this.comfyUIServerURL.replace('https://', 'wss://')}/ws?clientId=${this.clientId}`;
  
    this.comfyUI = new WebSocket(socketURL);
  
    const reader = new FileReader();
    reader.onload = () => {
      const arrayBuffer = reader.result;
      const dataView = new DataView(arrayBuffer);
      const event = dataView.getUint32(0);
      const format = dataView.getUint32(4);
      if (event === 1 && format === 2) { // 1=PREVIEW_IMAGE, 2=PNG
        // Extract Blob
        const blob = new Blob([new Uint8Array(arrayBuffer.slice(8))], {type: 'image/png'});
        this.imageURL = URL.createObjectURL(blob);
      }
    };

    // Connect
    this.comfyUI.onopen = (data) => {
      console.log('ComfyUI server opened.');
    };
  
    // Disconnect
    this.comfyUI.onclose = (data) => {
      console.log(`ComfyUI server closed: ${data}`);
    };
  
    // Message
    this.comfyUI.onmessage = async (event) => {
      // Send Image Websocket Method
      
      if (event.data instanceof Blob) {
        // Check if event.data is an image blob
        // https://github.com/Acly/comfyui-tooling-nodes (Send Image (WebSocket)
        reader.readAsArrayBuffer(event.data);
      } else {
        try {
          const message = JSON.parse(event.data);
          // console.log(message)
  
          if (message.type === 'status') {
            this.queueRemaining = message.data.status.exec_info.queue_remaining;
            if (this.queueRemaining === 0) {
              this.onQueueCallback();
            }
          }
  
          if (message.type === 'execution_error') {
            console.error('Execution Error');
            this.onQueueCallback();
          }
    
          if (message.data?.prompt_id) {
            if (message.type === 'executed') {
              // Queue Next Frame
              this.onSaveCallback(this.imageURL, message.data.prompt_id);
            }

            /*
            if (message.type === 'executed' && this.nodes.api_save.includes(message.data.node)) {
              // Method: Triggers when node matches "api_save" in the nodes object, usually a PreviewImage
          
              if (this.onQueueCallback) {
                console.log(`Completed Prompt: ${message.data.prompt_id}`);
                this.onQueueCallback();
              }
              if (this.onSaveCallback) {
                this.onSaveCallback(message);
              }
            }
            */
          }
        } catch (err) {
          console.error('Unknown message:', event.data);
          console.error(err);
        }
      }
    };
  
    // Error
    this.comfyUI.onerror = (err) => {
      console.error(err);
      console.error(`Websocket Error with Client ${this.clientId}`);
  
      // Close Websocket
      this.disconnect();
    };
  }

  disconnect() {
    console.log('Disconnecting from ComfyUI server...');
    this.comfyUI.close();
  }

  queue({
    workflow,
    workflowAPI,
    prompt,
    base64_data,
    ckpt_name,
    steps,
    denoise,
    vae,
    unet_name,
    model_type,
    lora_name,
    lora_name_detail,
    control_net_name,
  }) {
    return new Promise(async (resolve, reject) => {
      try {
        // console.log(`Queuing ComfyUI on ${this.comfyUIServerURL}`);

        // TODO: Ping to see if serverURL is open

        const randomSeed = Math.floor(Math.random() * 18446744073709552000);
        const workflowApiTemp = { ...workflowAPI };

        // Set WorkflowAPI
        // eslint-disable-next-line guard-for-in
        for (const nodeType in this.nodes) {
          this.nodes[nodeType].forEach((nodeId) => {
            if (nodeType === 'seeds') {
              workflowApiTemp[nodeId].inputs.seed = randomSeed;
            } else if (nodeType === 'prompts') {
              workflowApiTemp[nodeId].inputs.text = prompt;
            } else if (nodeType === 'denoise') {
              workflowApiTemp[nodeId].inputs.denoise = denoise;
            } else if (nodeType === 'strength') {
              // workflowApiTemp[nodeId].inputs.strength = 1 - denoise;
              // workflowApiTemp[nodeId].inputs.end_percent = 1 - denoise;
            } else if (nodeType === 'vae') {
              workflowApiTemp[nodeId].inputs.vae_name = vae;
            } else if (nodeType === 'ckpt_name') {
              workflowApiTemp[nodeId].inputs.ckpt_name = ckpt_name;
            } else if (nodeType === 'steps') {
              workflowApiTemp[nodeId].inputs.steps = steps;
            } else if (nodeType === 'base64_data') {
              workflowApiTemp[nodeId].inputs.image = base64_data; // Load Image (Base64)
            } else if (nodeType === 'unet_name') {
              workflowApiTemp[nodeId].inputs.unet_name = unet_name;
            } else if (nodeType === 'model_type') {
              workflowApiTemp[nodeId].inputs.model_type = model_type;
            } else if (nodeType === 'lora_name') {
              workflowApiTemp[nodeId].inputs.lora_name = lora_name;
            } else if (nodeType === 'lora_name_detail') {
              workflowApiTemp[nodeId].inputs.lora_name = lora_name_detail;
            } else if (nodeType === 'control_net_name') {
              workflowApiTemp[nodeId].inputs.control_net_name = control_net_name;
            }
          });
        }

        const options = {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prompt: workflowAPI,
            extra_data: {
              extra_pnginfo: {
                workflow,
              },
            },
            client_id: this.clientId,
          }),
        };

        const response = await fetch(`${this.comfyUIServerURL}/prompt`, options).then((res) => resolve(res.json()));
        resolve(response);
      } catch (err) {
        console.error(err);
        reject(err);
      }
    });
  }

  getFile({ filename, subfolder, type }) {
    return new Promise(async (resolve, reject) => {
      try {
        const data = {
          filename,
          subfolder,
          type,
        };

        resolve(`${this.comfyUIServerURL}/view?${new URLSearchParams(data)}`);
      } catch (err) {
        console.error(err);
        reject(err);
      }
    });
  }
}

export default ComfyUI;