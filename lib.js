'use strict';

/**************************************************
 * Initialization                                 *
***************************************************/
let receiverOnly = false;
let showVideo = false;
let isElectron = (navigator.userAgent.toLowerCase().indexOf(' electron/') > -1);

// Set up media stream constant and parameters.
const mediaStreamConstraints = {
    audio: {
        mandatory: {
            chromeMediaSource: 'desktop'
        }
    },
    video: {
        mandatory: {
            chromeMediaSource: 'desktop'
        }
    }
};

// Mac and Linux have to disable audio
// if you want to stream video.
// Receiver only will work fine either way
//mediaStreamConstraints.audio = false;

// Set up to exchange only video.
const offerOptions = {
    offerToReceiveAudio: 1,
    offerToReceiveVideo: (showVideo) ? 1 : 0
};

// Define media elements.
const localMedia = document.getElementById('localMedia');
const localAudio = document.getElementById('localAudio');
const localVideo = document.getElementById('localVideo');

// Container for remote media elements
const remoteMedia = document.getElementById('remoteMedia');

// Socket ID element
const socketIdElem = document.getElementById('socketId');
const streamFromElem = document.getElementById('streamFrom');

// Hide video elements
if (showVideo === false) {
    hideVideoElements();
}
// Prevent file:// protocol issues
if (isElectron === false && location.href.includes('file://')) {
    enableReceiverOnly();
}
// Prevent screen capture issues
if (isElectron === false) {
    document.getElementById('fromDesktop').remove();
}

let localStream = null;
const servers = null;  // Allows for RTC server configuration.




/**************************************************
 * Stream related functions                       *
***************************************************/

// Setup local media streams
async function setupLocalMediaStreams() {
    return new Promise((resolve, reject) => {
        navigator.mediaDevices.getUserMedia(mediaStreamConstraints)
        .then((stream) => {
            gotLocalMediaStream(stream);
            resolve();
        })
        .catch((e) => {
            trace(`Failed to obtain local media stream: ${e}`);

            // We weren't able to get a local media stream
            // Become a receiver
            enableReceiverOnly();
            reject();
        });
    });
}

async function setupLocalMediaStreamsFromFile(filepath) {
    return new Promise(async (resolve, reject) => {
        if (receiverOnly) {
            resolve();
            return;
        }

        let mediaSource = new MediaSource();
        mediaSource.addEventListener('sourceopen', sourceOpen);

        trace('Created MediaSource.');
        console.dir(mediaSource);

        // srcObject doesn't work here ?
        localAudio.src = URL.createObjectURL(mediaSource);

        let buffer;
        async function sourceOpen() {
            trace('MediaSource open.');

            // Corner case for file:// protocol since fetch won't like it
            if (isElectron === false && location.href.includes('file://')) {
                // TODO: Audio still wouldn't transmit
                // URL.revokeObjectURL(localAudio.src);
                // localAudio.src = './test_file.mp3'
            } else {
                buffer = mediaSource.addSourceBuffer('audio/mpeg');

                trace('Fetching data...');
                let data;
                let resp = await fetch(filepath);
                data = await resp.arrayBuffer();
                console.dir(data);
                buffer.appendBuffer(data);
                trace('Data loaded.');
            }

            try {
                localStream = localAudio.captureStream();
            } catch(e) {
                trace(`Failed to captureStream() on audio elem. Assuming unsupported. Switching to receiver only.`);

                enableReceiverOnly();
            }
            resolve();
        }
    });
}

// Sets the MediaStream as the video element src.
function gotLocalMediaStream(mediaStream) {
    localAudio.srcObject = mediaStream;
    if (showVideo)
        localVideo.srcObject = mediaStream;

    localStream = mediaStream;
    trace('Received local stream.');
}




/**************************************************
 * DOM related functions                          *
***************************************************/

function enableReceiverOnly() {
    receiverOnly = true;
    localMedia.innerHTML = 'Receiver only';
    streamFromElem.style.display = 'none';

    trace('Switched to receiver only.');
}

function hideVideoElements() {
    localVideo.style.display = 'none';

    // Hide all remote video elements
    let remoteVideos = document.getElementsByClassName('remoteVideo');
    for (let i = 0; i < remoteVideos.length; i++) {
        remoteVideos[i].style.display = 'none';
    }
}

function handleError(e) {
    console.error(e);
    console.dir(e);
    console.trace(e);
}

// Logs an action (text) and the time when it happened on the console.
function trace(text) {
    text = text.trim();
    const now = (performance.now() / 1000).toFixed(3);

    console.log(now, text);
}




/**************************************************
 * WebRTC connections                             *
***************************************************/
class Peer {
    constructor(id, socket) {
        this.id = id;
        this.socket = socket; // This is our class wrapped socket. Not socket.io socket
        this.initiated = false;
        this.offered = false;
        this.answered = false;
        this.conn = null;
        this.iceCandidates = [];
        this.remoteStream = null;
        this.titleElem = null;
        this.audioElem = null;
        this.videoElem = null;

        this.conn = new RTCPeerConnection(servers);
        trace('Created local peer connection object localPeerConnection.');

        // Use arrow function so that 'this' is available in class methods
        this.conn.addEventListener('icecandidate', (event) => {
            this.handleIceCandidates(event);
        });
        this.conn.addEventListener('iceconnectionstatechange', (event) => {
            this.handleConnectionChange(event);
        });
        this.conn.addEventListener('track', (event) => {
            this.gotRemoteMediaStream(event);
        });
    }

    reconnect() {
        if (this.titleElem) {
            this.titleElem.remove();
        }

        if (this.audioElem) {
            this.audioElem.remove();
        }

        if (this.videoElem) {
            this.videoElem.remove();
        }
    }

    disconnect() {
        this.conn.close();

        if (this.titleElem) {
            this.titleElem.remove();
        }

        if (this.audioElem) {
            this.audioElem.remove();
        }

        if (this.videoElem) {
            this.videoElem.remove();
        }

        // TODO: This is meh coupling
        this.socket.disconnected(this.id);
        trace(`Disconnected from ${this.id}.`);
    }

    // Connects with new peer candidate.
    handleIceCandidates(event) {
        if (event.candidate) {
            this.socket.socket.emit('candidate', event.candidate, this.id);
            trace(`Sent ICE candidate to ${this.id}.`);
        }
    }

    // Logs changes to the connection state.
    handleConnectionChange(event) {
        trace(`ICE state changed to: ${event.target.iceConnectionState}.`);

        if (event.target.iceConnectionState === 'disconnected') { // || event.target.iceConnectionState === 'closed' || event.target.iceConnectionState === 'failed') {
            this.disconnect();
        }
    }

    uncacheICECandidates() {
        if (!(this.conn && this.conn.remoteDescription.type)) {
            console.warn(`Connection was not in a state for uncaching.`);
            return;
        }

        this.iceCandidates.forEach((candidate) => {
            trace(`Added cached ICE candidate`);
            this.conn.addIceCandidate(candidate);
        });

        this.iceCandidates = [];
    }

    // Handles remote MediaStream success by adding it as the remoteVideo src.
    gotRemoteMediaStream(event) {
        this.remoteStream = event.streams[0];

        this.titleElem = document.createElement('h3');
        this.titleElem.innerHTML = `${this.id}:`;
        remoteMedia.appendChild(this.titleElem);

        this.audioElem = new Audio();
        this.audioElem.autoplay = true;
        this.audioElem.controls = true;
        this.audioElem.srcObject = this.remoteStream;

        remoteMedia.appendChild(this.audioElem);

        if (showVideo) {
            this.videoElem = document.createElement('video');
            this.videoElem.autoplay = true;
            this.videoElem.controls = true;
            this.videoElem.muted = true;
            this.videoElem.srcObject = this.remoteStream;

            remoteMedia.appendChild(this.videoElem);
        }

        trace(`Received remote stream from ${this.id}.`);
    }
}

/**
 * Factory function for creating a new Peer and connecting streams to it.
 * @param {string} id
 */
async function createPeer(id, socket) {
    trace(`Starting connection to ${id}...`);

    let peer = null;
    let videoTracks = null;
    let audioTracks = null;
    if (receiverOnly === false) {
        videoTracks = localStream.getVideoTracks();
        audioTracks = localStream.getAudioTracks();

        trace(`Audio devices:`);
        console.dir(audioTracks);

        if (showVideo && videoTracks.length > 0) {
            trace(`Using video device: ${videoTracks[0].label}.`);
        }
        if (audioTracks.length > 0) {
            trace(`Using audio device: ${audioTracks[0].label}.`);
        }
    }

    // Create peer connections and add behavior.
    peer = new Peer(id, socket);

    // Add local stream to connection and create offer to connect.
    if (receiverOnly === false && showVideo && videoTracks[0]) {
        peer.conn.addTrack(videoTracks[0], localStream);
    }
    if (receiverOnly === false && audioTracks[0]) {
        peer.conn.addTrack(audioTracks[0], localStream);
    }

    return peer;
}


/**************************************************
 * Socket.io signaling                            *
***************************************************/
class Socket {
    constructor(ip, port) {
        this.ip = ip;
        this.port = port;
        this.rooms = [];
        this.peers = {};

        this.socket = io.connect(`http://${this.ip}:${this.port}`);
        trace(`Created socket.`);
        console.dir(this.socket);

        // This is emitted when this socket successfully creates
        this.socket.on('created', (room, socketId) => {
            trace(`${socketId} successfully created ${room}.`);
            socketIdElem.innerHTML = this.socket.id;

            this.rooms.push(room);
        });

        // This is emitted when this socket successfully joins
        this.socket.on('joined', (room, socketId) => {
            trace(`${socketId} successfully joined ${room}.`);
            socketIdElem.innerHTML = this.socket.id;

            this.rooms.push(room);
        });

        this.socket.on('full', (room) => {
            console.warn(`Room ${room} is full.`);
        });

        this.socket.on('ipaddr', (ipaddr) => {
            trace(`Server IP address: ${ipaddr}`);
        });

        // This is emitted when someone else joins
        this.socket.on('join', async (socketId) => {
            // Have to ignore our own join
            if (socketId === this.socket.id) {
                return;
            }

            let peer = this.peers[socketId];

            trace(`'${socketId}' joined.`);

            // Connection already existed
            // Close old one
            if (peer) {
                this.handleDisconnect(peer.id);
            }

            peer = await createPeer(socketId, this);
            this.peers[peer.id] = peer;
            peer.offered = true;

            trace(`createOffer to ${socketId} started.`);
            let offer = await peer.conn.createOffer(offerOptions);
            await peer.conn.setLocalDescription(offer);

            console.log(peer);
            this.socket.emit('offer', offer, peer.id);
        });

        this.socket.on('offer', async (offer, socketId) => {
            let peer = this.peers[socketId];

            trace(`Offer received from ${socketId}:`);
            console.dir(offer);

            // Peer might exist because of ICE candidates
            if (peer) {
                console.warn(`Peer already existed at offer.`);
                peer.reconnect();
            } else {
                peer = await createPeer(socketId, this);
                this.peers[peer.id] = peer;
            }

            peer.answered = true;

            await peer.conn.setRemoteDescription(offer);
            let answer = await peer.conn.createAnswer(offerOptions);
            await peer.conn.setLocalDescription(answer);

            this.socket.emit('answer', answer, socketId);

            // Restore any cached ICE candidates
            peer.uncacheICECandidates();
        });

        this.socket.on('answer', async (answer, socketId) => {
            let peer = this.peers[socketId];

            // Make sure we're expecting an answer
            if (!(peer && peer.offered)) {
                console.warn(`Unexpected answer from ${socketId} to ${this.socket.id}.`);
                return;
            }

            trace(`Answer received from ${socketId}:`);
            console.dir(answer);

            await peer.conn.setRemoteDescription(answer);

            // Restore any cached ICE candidates
            peer.uncacheICECandidates();
        });

        this.socket.on('candidate', async (candidate, ownerId) => {
            let peer = this.peers[ownerId];

            // Make sure we're expecting candidates
            if (!(peer && (peer.offered || peer.answered))) {
                console.warn(`Unexpected ICE candidates from ${ownerId} to ${this.socket.id}.`);
                return;
            }

            trace(`Received ICE candidate for ${ownerId}.`);

            let iceCandidate = new RTCIceCandidate(candidate);

            // Cache ICE candidates if the connection isn't ready yet
            if (peer.conn && peer.conn.remoteDescription && peer.conn.remoteDescription.type) {
                await peer.conn.addIceCandidate(iceCandidate);
            } else {
                trace(`Cached ICE candidate`);
                peer.iceCandidates.push(iceCandidate);
            }
        });

        this.socket.on('leave', (room, socketId) => {
            let peer = this.peers[socketId];

            if (peer) {
                trace(`${socketId} left ${room}.`);
                peer.disconnect();
            }

            this.peers[socketId] = null;
        });
    }

    joinRoom(room) {
        trace(`Entering room '${room}'...`);
        this.socket.emit('join', room);
    }

    leaveRoom(room) {
        trace(`Leaving room ${room}...`);
        this.socket.emit('leave', room, this.socket.id);

        this.rooms = this.rooms.filter((val) => val !== room);
    }

    leaveAllRooms() {
        this.rooms.forEach((val) => {
            this.leaveRoom(val);
        });
    }

    disconnected(id) {
        this.peers[id] = null;
        trace(`Removed ${id} from peer list.`);
    }
}

class Room {
    constructor(name) {
        this.name = name;
        this.peers = {};
    }
}