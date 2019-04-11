'use strict';

// Set up media stream constant and parameters.

let ipaddr = '192.168.1.207';
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
//mediaStreamConstraints.audio = false;

// Set up to exchange only video.
const offerOptions = {
    offerToReceiveAudio: 1,
    offerToReceiveVideo: (showVideo) ? 1 : 0
};

// Define initial start time of the call (defined as connection between peers).
let startTime = null;

// Define peer connections, streams and video elements.
const localAudio = document.getElementById('localAudio');
const localVideo = document.getElementById('localVideo');

const remoteAudio = document.getElementById('remoteAudio');
const removeVideo = document.getElementById('remoteVideo');

// Hide video elements
if (showVideo === false) {
    localVideo.style.display = 'none';
    remoteVideo.style.display = 'none';
}

let localStream = null;
let remoteStream = null;

let localPeerConnection = null;
let iceCandidates = [];

function handleError(e) {
    console.error(e);
    console.dir(e);
    console.trace(e);
}

// Setup local media streams
async function setupLocalMediaStreams() {
    navigator.mediaDevices.getUserMedia(mediaStreamConstraints)
    .then((stream) => {
        gotLocalMediaStream(stream);
    })
    .catch((e) => {
        // We weren't able to get a local media stream
        // Become a receiver
        receiverOnly = true;

        localAudio.style.display = 'none';
        localVideo.style.display = 'none';
    });
}

async function setupLocalMediaStreamsFromFile(filepath) {
    trace('Creating MediaSource...');
    let mediaSource = new MediaSource();
    mediaSource.addEventListener('sourceopen', sourceOpen);
    console.dir(mediaSource);

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

        localStream = localAudio.captureStream();

        // setInterval(() => {

        //     data = [];
        //     for (let j = 0; j < 10000; j++) {
        //         data.push(Math.random() * 1500);
        //     }
        //     buffer.appendBuffer(Int32Array.from(data));
        //     console.dir(data);
        // }, 3);
    }
}

// Define MediaStreams callbacks.

// Sets the MediaStream as the video element src.
function gotLocalMediaStream(mediaStream) {
    localAudio.srcObject = mediaStream;
    if (showVideo)
        localVideo.srcObject = mediaStream;

    localStream = mediaStream;
    trace('Received local stream.');
}

// Handles remote MediaStream success by adding it as the remoteVideo src.
function gotRemoteMediaStream(event) {
    const mediaStream = event.streams[0];

    remoteAudio.srcObject = mediaStream;
    if (showVideo)
        remoteVideo.srcObject = mediaStream;

    remoteStream = mediaStream;
    trace('Received remote stream.');
}

// Socket.io stuff
let created = false;
let offered = false;
let answered = false;
let room = 'test';

var socket = io.connect(`http://${ipaddr}:8080`);
trace(`Created socket.`);
console.dir(socket);

socket.on('created', (room, clientId) => {
    trace(`${clientId} successfully created room.`);
    created = true;
});

socket.on('joined', (room, clientId) => {
    trace(`${clientId} successfully joined room.`);
});

socket.on('full', (room) => {
    console.warn(`Room ${room} is full.`);
});

socket.on('ipaddr', (ipaddr) => {
    trace(`Server IP address: ${ipaddr}`);
});

socket.on('offer', async (offer) => {
    // Do nothing if we're the ones who offered
    if (offered) {
        trace(`Offer ignored`);
        return;
    }

    trace('Offer received:');
    console.dir(offer);

    await localPeerConnection.setRemoteDescription(offer);
    let answer = await localPeerConnection.createAnswer(offerOptions);
    await localPeerConnection.setLocalDescription(answer);

    answered = true;
    socket.emit('answer', answer);

    // Restore any cached ICE candidates
    if (iceCandidates.length !== 0) {
        iceCandidates.forEach((val) => {
            let candidate = new RTCIceCandidate(val);
            localPeerConnection.addIceCandidate(candidate);
        });

        iceCandidates = [];
    }
});

socket.on('answer', async (answer) => {
    // Do nothing if we're the ones who offered
    if (answered) {
        // trace(`Answer ignored`);
        return;
    }

    trace('Answer received:');
    console.dir(answer);

    await localPeerConnection.setRemoteDescription(answer);

    // Restore any cached ICE candidates
    if (iceCandidates.length !== 0) {
        iceCandidates.forEach((val) => {
            trace(`Added cached ICE candidate`);
            let candidate = new RTCIceCandidate(val);
            localPeerConnection.addIceCandidate(candidate);
        });

        iceCandidates = [];
    }
});

socket.on('candidate', async (socketId, candidate) => {
    if (socketId === socket.id) {
        // trace(`Ignored own ICE candidate.`);
        return;
    }

    // trace(`Received ICE candidate.`);
    // console.dir(candidate);

    let iceCandidate = new RTCIceCandidate(candidate);

    // Cache ICE candidates if the connection isn't ready yet
    if (localPeerConnection && localPeerConnection.remoteDescription.type) {
        await localPeerConnection.addIceCandidate(iceCandidate);
    } else {
        trace(`Cached ICE candidate`);
        iceCandidates.push(iceCandidate);
    }
});

socket.on('ready', async () => {
    // Only do this if we were the one to create the room
    if (created) {
        trace('localPeerConnection createOffer start.');
        let offer = await localPeerConnection.createOffer(offerOptions);
        await localPeerConnection.setLocalDescription(offer);

        offered = true;
        socket.emit('offer', offer);
    }
});

// Connects with new peer candidate.
function handleIceCandidates(event) {
    console.dir(event);

    if (event.candidate) {
        socket.emit('candidate', socket.id, event.candidate);
        trace(`Sent ICE candidate: ${event.candidate.candidate}`);
    }
}

async function connectToPeer() {
    trace('Starting connection');
    startTime = performance.now();

    if (room !== "") {
        trace(`Entering room ${room}...`);
        socket.emit('room', room);
    }

    // Get local media stream tracks.
    let videoTracks = null;
    let audioTracks = null;
    if (receiverOnly === false) {
        videoTracks = localStream.getVideoTracks();
        audioTracks = localStream.getAudioTracks();

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
    localPeerConnection = new RTCPeerConnection(servers);
    trace('Created local peer connection object localPeerConnection.');

    localPeerConnection.addEventListener('icecandidate', handleIceCandidates);
    localPeerConnection.addEventListener('iceconnectionstatechange', handleConnectionChange);
    localPeerConnection.addEventListener('track', gotRemoteMediaStream);

    // Add local stream to connection and create offer to connect.
    if (receiverOnly === false && showVideo && videoTracks[0])
        localPeerConnection.addTrack(videoTracks[0], localStream);
    if (receiverOnly === false && audioTracks[0])
        localPeerConnection.addTrack(audioTracks[0], localStream);
    trace('Added local stream to localPeerConnection.');
}

// Logs changes to the connection state.
function handleConnectionChange(event) {
    const peerConnection = event.target;
    console.log('ICE state change event: ', event);
    trace(`ICE state: ${peerConnection.iceConnectionState}.`);
}

function disconnectFromPeer() {
    localPeerConnection.close();
    localPeerConnection = null;
    created = false;
    offered = false;
    answered = false;
    trace('Disconnected.');
}

// Logs an action (text) and the time when it happened on the console.
function trace(text) {
    text = text.trim();
    const now = (performance.now() / 1000).toFixed(3);

    console.log(now, text);
}