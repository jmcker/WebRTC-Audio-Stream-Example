'use strict';

// Set up media stream constant and parameters.

let ipaddr = 'symboxtra.dynu.net';
let room = 'test';
let showVideo = false;
let receiverOnly = false;

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

class Peer {
    constructor(id) {
        this.id = id;
        this.initiated = false;
        this.offered = false;
        this.answered = false;
        this.conn = null;
        this.iceCandidates = [];
        this.remoteStream = null;
        this.titleElem = null;
        this.audioElem = null;
        this.videoElem = null;
    }

    // Connects with new peer candidate.
    handleIceCandidates(event) {
        if (event.candidate) {
            socket.emit('candidate', event.candidate, this.id);
            trace(`Sent ICE candidate to ${this.id}.`);
        }
    }

    // Logs changes to the connection state.
    handleConnectionChange(event) {
        trace(`ICE state changed to: ${event.target.iceConnectionState}.`);

        if (event.target.iceConnectionState === 'disconnected') { // || event.target.iceConnectionState === 'closed' || event.target.iceConnectionState === 'failed') {
            disconnectFromPeer(this.id);
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

let peers = {};
let localStream = null;

// Define peer connections, streams and video elements.
const localMedia = document.getElementById('localMedia');
const localAudio = document.getElementById('localAudio');
const localVideo = document.getElementById('localVideo');

// Container for remote media elements
const remoteMedia = document.getElementById('remoteMedia');

// Hide video elements
if (showVideo === false) {
    hideVideoElements();
}

// Setup local media streams
async function setupLocalMediaStreams() {
    navigator.mediaDevices.getUserMedia(mediaStreamConstraints)
    .then((stream) => {
        gotLocalMediaStream(stream);
    })
    .catch((e) => {
        trace(`Failed to obtain local media stream: ${e}`);

        // We weren't able to get a local media stream
        // Become a receiver
        receiverOnly = true;

        localMedia.style.display = 'none';
    });
}

async function setupLocalMediaStreamsFromFile(filepath) {
    let mediaSource = new MediaSource();
    mediaSource.addEventListener('sourceopen', sourceOpen);

    trace('Created MediaSource.');
    console.dir(mediaSource);

    // srcObject doesn't work here ?
    localAudio.src = URL.createObjectURL(mediaSource);

    let buffer;
    async function sourceOpen() {
        trace('MediaSource open.');

        buffer = mediaSource.addSourceBuffer('audio/mpeg');

        trace('Fetching data...');
        let data;
        let resp = await fetch(filepath);
        data = await resp.arrayBuffer();
        console.dir(data);
        buffer.appendBuffer(data);
        trace('Data loaded.');

        localStream = localAudio.captureStream();
    }
}

// Sets the MediaStream as the video element src.
function gotLocalMediaStream(mediaStream) {
    localAudio.srcObject = mediaStream;
    if (showVideo)
        localVideo.srcObject = mediaStream;

    localStream = mediaStream;
    trace('Received local stream.');
}

function connectToPeers() {
    trace(`Entering room '${room}'...`);
    socket.emit('room', room);
}

async function createPeer(id) {
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

    const servers = null;  // Allows for RTC server configuration.

    // Create peer connections and add behavior.
    peer = new Peer(id);
    peer.conn = new RTCPeerConnection(servers);
    trace('Created local peer connection object localPeerConnection.');

    // Use arrow function so that 'this' is available in class methods
    peer.conn.addEventListener('icecandidate', (event) => {
        peer.handleIceCandidates(event);
    });
    peer.conn.addEventListener('iceconnectionstatechange', (event) => {
        peer.handleConnectionChange(event);
    });
    peer.conn.addEventListener('track', (event) => {
        peer.gotRemoteMediaStream(event);
    });

    // Add local stream to connection and create offer to connect.
    if (receiverOnly === false && showVideo && videoTracks[0]) {
        peer.conn.addTrack(videoTracks[0], localStream);
    }
    if (receiverOnly === false && audioTracks[0]) {
        peer.conn.addTrack(audioTracks[0], localStream);
    }

    // Cache the connection
    peers[peer.id] = peer;

    return peer;
}

function reconnectPeer(id) {
    let peer = peers[id];

    if (peer.titleElem) {
        peer.titleElem.remove();
    }

    if (peer.audioElem) {
        peer.audioElem.remove();
    }

    if (peer.videoElem) {
        peer.videoElem.remove();
    }
}

function disconnectFromPeer(id) {
    let peer = peers[id];
    peer.conn.close();

    if (peer.titleElem) {
        peer.titleElem.remove();
    }

    if (peer.audioElem) {
        peer.audioElem.remove();
    }

    if (peer.videoElem) {
        peer.videoElem.remove();
    }

    peers[id] = null;
    trace(`Disconnected from ${id}.`);
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
 * Socket.io signaling                            *
***************************************************/
var socket = io.connect(`http://${ipaddr}:8080`);
trace(`Created socket.`);
console.dir(socket);

// This is emitted when this socket successfully creates
socket.on('created', (room, socketId) => {
    trace(`${socketId} successfully created ${room}.`);
    document.getElementById('socket_id').innerHTML = socket.id;
});

// This is emitted when this socket successfully joins
socket.on('joined', (room, socketId) => {
    trace(`${socketId} successfully joined ${room}.`);
    document.getElementById('socket_id').innerHTML = socket.id;
});

socket.on('full', (room) => {
    console.warn(`Room ${room} is full.`);
});

socket.on('ipaddr', (ipaddr) => {
    trace(`Server IP address: ${ipaddr}`);
});

// This is emitted when someone else joins
socket.on('join', async (socketId) => {
    // Have to ignore our own join
    if (socketId === socket.id) {
        return;
    }

    let peer = peers[socketId];

    trace(`'${socketId}' joined.`);

    // Connection already existed
    // Close old one
    if (peer) {
        disconnectFromPeer(socketId);
    }

    peer = await createPeer(socketId);
    peer.offered = true;

    trace(`createOffer to ${socketId} started.`);
    let offer = await peer.conn.createOffer(offerOptions);
    await peer.conn.setLocalDescription(offer);

    console.log(peer);
    socket.emit('offer', offer, peer.id);
});

socket.on('offer', async (offer, socketId) => {
    let peer = peers[socketId];

    trace(`Offer received from ${socketId}:`);
    console.dir(offer);

    // Peer might exist because of ICE candidates
    if (peer) {
        console.warn(`Peer already existed at offer.`);
        reconnectPeer(socketId);
    } else {
        peer = await createPeer(socketId);
    }

    peer.answered = true;

    await peer.conn.setRemoteDescription(offer);
    let answer = await peer.conn.createAnswer(offerOptions);
    await peer.conn.setLocalDescription(answer);

    socket.emit('answer', answer, socketId);

    // Restore any cached ICE candidates
    peer.uncacheICECandidates();
});

socket.on('answer', async (answer, socketId) => {
    let peer = peers[socketId];

    // Make sure we're expecting an answer
    if (!(peer && peer.offered)) {
        console.warn(`Unexpected answer from ${socketId} to ${socket.id}.`);
        return;
    }

    trace(`Answer received from ${socketId}:`);
    console.dir(answer);

    await peer.conn.setRemoteDescription(answer);

    // Restore any cached ICE candidates
    peer.uncacheICECandidates();
});

socket.on('candidate', async (candidate, ownerId) => {
    let peer = peers[ownerId];

    // Make sure we're expecting candidates
    if (!(peer && (peer.offered || peer.answered))) {
        console.warn(`Unexpected ICE candidates from ${ownerId} to ${socket.id}.`);
        return;
    }

    trace(`Received ICE candidate for ${ownerId}.`);

    let iceCandidate = new RTCIceCandidate(candidate);

    // Cache ICE candidates if the connection isn't ready yet
    if (peer.conn && peer.conn.remoteDescription.type) {
        await peer.conn.addIceCandidate(iceCandidate);
    } else {
        trace(`Cached ICE candidate`);
        peer.iceCandidates.push(iceCandidate);
    }
});




/**************************************************
 * DOM related functions                          *
***************************************************/

function hideVideoElements() {
    localVideo.style.display = 'none';

    // Hide all remote video elements
    let remoteVideos = document.getElementsByClassName('remoteVideo');
    for (let i = 0; i < remoteVideos.length; i++) {
        remoteVideos[i].style.display = 'none';
    }
}
