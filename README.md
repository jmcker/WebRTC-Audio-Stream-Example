## WebRTC-Audio-Stream-Example ##



### Node/Socket.io Signaling Server ###

The signaling server identifies and facilitates negotiations between
transceivers before they drop into a peer-to-peer connection. It must be run on a machine
that is accessible by both transceivers.

1. ```npm install```
2. Run ```node ./server.js``` on a machine accessible by both planned transceivers.
3. Update the IP or URL and port in the ```index.html``` call to ```new Socket(ipaddr, port)```. These should point to your signaling server.
4. Leave this running.

### Electron Transceiver ###
1. ```npm install```
2. Run ```npm start```.
3. Enter a room name.
4. Select the stream source.
5. Press the ```Connect``` button.
6. Audio/video should start to flow.

### Browser Receiver ###
Serve the required files over ```file://``` or HTTP to use them in the browser. This has been confirmed to work (some receiver only) in Chrome, FireFox, and Chrome Android.


Make sure to ```npm install``` or some of the dependencies won't exist.

#### file:// protocol ####
1. The simplest test would be loading the file over the ```file://``` protocol.
2. Open ```index.html``` in a browser by double-clicking it or dragging it into an open window.

#### HTTP Server ####
- Temporarily serve the current directory for testing: ```python -m SimpleHTTPServer```
- Or move the project folder (with node_modules) into a pre-existing webserver setup.


### Notes ###
- Video can be enabled in ```lib.js```. Flip ```showVideo``` to ```true```.
- Linux and Mac have no support for capturing an audio stream. Uncomment line ~26 in ```lib.js``` if you want to transmit video from them.
Left as is, they will still function as receivers.
- Beware of the firewall when trying to reach the signaling server. Mine blocked traffic to it.
The signaling server is setup to respond with 404 to any HTTP request. You can check if connection is possible in a browser; helpful in verifying connectivity.
- Unmuting the ```Local``` audio element can be used to verify that the stream is actually capturing.
You should hear an echoey/phasey effect.
