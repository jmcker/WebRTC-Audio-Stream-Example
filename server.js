'use strict';

const ADDRESS = '0.0.0.0';
const PORT = 8080;
const MAX_CLIENTS = 50;

let os = require('os');
let app = require('http').createServer(handler);
let io = require('socket.io')(app);

app.listen(PORT, ADDRESS);
console.log(`Socket.io server listening on ${ADDRESS}:${PORT}...`);

// This response can be used to debug firewall or other connectivity issues
function handler (req, res) {
    res.statusCode = 404;
    res.write('<h1>404 - Not Found</h1>');
    res.end();
}

io.on('connection', (socket) => {
    socket.on('join', (room) => {
        console.log('Received request to create or join room ' + room);

        let clientsInRoom = io.sockets.adapter.rooms[room];
        let numClients = clientsInRoom ? Object.keys(clientsInRoom.sockets).length : 0;

        // Add 1 since we'll be adding ourselves shortly
        numClients += 1;

        console.log(`Room ${room} now has ${numClients} client(s)`);

        if (numClients === 1) {
            socket.join(room);
            console.log(`Client ID ${socket.id} created room ${room}`);
            socket.emit('created', room, socket.id);

        } else if (numClients < MAX_CLIENTS) {
            socket.join(room);
            console.log(`Client ID ${socket.id} joined room ${room}`);
            socket.emit('joined', room, socket.id);

            io.to(room).emit('join', socket.id);
        } else {
            console.log(`Max clients (${MAX_CLIENT}) reached.`);
            socket.emit('full', room);
        }
    });

    socket.on('offer', (offer, recipientId) => {
        io.to(recipientId).emit('offer', offer, socket.id);
    });

    socket.on('answer', (answer, recipientId) => {
        io.to(recipientId).emit('answer', answer, socket.id);
    });

    socket.on('candidate', (candidate, recipientId) => {
        io.to(recipientId).emit('candidate', candidate, socket.id);
    });

    socket.on('leave', (room, socketId) => {
        io.to(room).emit('leave', room, socketId);
        socket.leave(room);
        console.log(`Client ID ${socket.id} left room ${room}`);
    });

    socket.on('ipaddr', () => {
        let ifaces = os.networkInterfaces();
        for (let dev in ifaces) {
            ifaces[dev].forEach(function (details) {
                if (details.family === 'IPv4' && details.address !== '127.0.0.1') {
                    socket.emit('ipaddr', details.address);
                }
            });
        }
    });

});