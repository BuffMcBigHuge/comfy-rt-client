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
        // Queue Next Frame
        this.onQueueCallback();

        // Extract Blob
        const blob = new Blob([new Uint8Array(arrayBuffer.slice(8))], {type: 'image/png'});
        this.imageURL = URL.createObjectURL(blob);

        // Callback Image URL
        // this.onSaveCallback(imageURL);
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
      // Check if event.data is an image blob
      if (event.data instanceof Blob) {
        reader.readAsArrayBuffer(event.data);
      } else {
        const message = JSON.parse(event.data);
        // console.log(message)

        if (message.type === 'status') {
          // console.log('Status Update:', message.data.status)
          this.queueRemaining = message.data.status.exec_info.queue_remaining;
        }

        if (message.type === 'execution_error') {
          console.error('Execution Error');
          this.onQueueCallback();
        }
  
        if (message.data?.prompt_id) {      
          // if (message.type === 'executed' && this.nodes.api_save.includes(message.data.node)) {
          if (message.type === 'executed') {
            this.onSaveCallback(this.imageURL, message.data.prompt_id);
            // Triggers when node matches "api_save" in the nodes object, usually a PreviewImage
  
            // PreviewImage Method
            /*
            if (this.onQueueCallback) {
              console.log(`Completed Prompt: ${message.data.prompt_id}`);
              this.onQueueCallback();
            }
            if (this.onSaveCallback) {
              this.onSaveCallback(message);
            }
            */
          }
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

  queue({
    workflow,
    workflowAPI,
    prompt,
    base64_data,
    checkpoint,
    denoise,
    unet_name,
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
            } else if (nodeType === 'checkpoint') {
              workflowApiTemp[nodeId].inputs.ckpt_name = checkpoint;
            } else if (nodeType === 'base64_data') {
              workflowApiTemp[nodeId].inputs.base64_data = base64_data;
            } else if (nodeType === 'unet_name') {
              workflowApiTemp[nodeId].inputs.unet_name = unet_name;
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