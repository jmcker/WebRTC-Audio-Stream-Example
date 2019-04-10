## WebRTC-Audio-Stream-Example ##

### Signaling Server ###

The signaling server identifies and facilitates negotiations between the two
transceivers before they drop into a peer-to-peer connection. It must be run on a machine
that is accessible by both transceivers.

1. ```npm install```
2. Run ```node ./server.js``` on a machine accessible by both planned transceivers.
3. Update ```ipaddr``` in ```lib.js``` to point to this machine.
4. Leave this running

### Transceiver (pair) ###
1. ```npm install```
2. Run ```npm start```
3. Press the ```Connect``` button.
4. Audio/video should start to flow.


### Notes ###
- Video can be enabled in ```lib.js```. Flip ```showVideo``` to ```true```.
- Linux and Mac have no support for capturing an audio stream. Uncomment line ~22 in ```lib.js``` to continue to use them as a receiver.
- Beware of the firewall when trying to reach the signaling server. Mine blocked traffic to it.
```<ipaddr>:8080``` is setup to respond with 404 to any HTTP request; helpful in verifying connectivity.
- Unmuting the ```Local``` audio element can be used to verify that the stream is actually capturing.
You should hear an echoey/phasey effect.
