const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server, {
  cors: {
    origin: 'https://romantic-chat-frontend.onrender.com',
    methods: ['GET', 'POST']
  }
});
const { v4: uuidv4 } = require('uuid');

app.use(express.static('public'));

const users = { 'Rav': null, 'Mon': null };
const messages = [];

io.on('connection', socket => {
  console.log('Client connected:', socket.id);
  socket.on('login', username => {
    console.log('Login attempt:', username);
    if (['Rav', 'Mon'].includes(username)) {
      if (!users[username] || !users[username].connected) {
        users[username] = { id: socket.id, connected: true, peerId: null };
        socket.emit('login-success', { username, messages });
        io.emit('user-status', users);
        console.log(`${username} logged in`);
      } else {
        socket.emit('login-failed', 'User already logged in');
        console.log(`${username} login failed: already logged in`);
      }
    } else {
      socket.emit('login-failed', 'Invalid username');
      console.log(`${username} login failed: invalid username`);
    }
  });

  socket.on('peer-id', peerId => {
    const username = Object.keys(users).find(u => users[u]?.id === socket.id);
    if (username) {
      users[username].peerId = peerId;
      console.log(`${username} registered Peer ID: ${peerId}`);
    }
  });

  socket.on('message', ({ username, text, file, fileName }) => {
    if (['Rav', 'Mon'].includes(username)) {
      const message = { id: uuidv4(), username, text, file, fileName, timestamp: new Date().toISOString() };
      messages.push(message);
      io.emit('message', message);
    }
  });

  socket.on('delete-message', messageId => {
    const index = messages.findIndex(msg => msg.id === messageId);
    if (index !== -1) {
      messages.splice(index, 1);
      io.emit('messages-updated', messages);
    }
  });

  socket.on('call-user', ({ to, type, offer }) => {
    if (users[to] && users[to].connected) {
      io.to(users[to].id).emit('incoming-call', {
        from: socket.id,
        username: Object.keys(users).find(key => users[key].id === socket.id),
        type,
        offer
      });
    }
  });

  socket.on('call-answer', ({ to, answer }) => {
    if (users[to] && users[to].connected) {
      io.to(users[to].id).emit('call-answered', { answer });
    }
  });

  socket.on('ice-candidate', ({ to, candidate }) => {
    if (users[to] && users[to].connected) {
      io.to(users[to].id).emit('ice-candidate', { candidate });
    }
  });

  socket.on('accept-call', ({ to }) => {
    io.to(to).emit('call-accepted');
  });

  socket.on('reject-call', ({ to }) => {
    io.to(to).emit('call-rejected');
  });

  socket.on('end-call', ({ to }) => {
    io.to(to).emit('call-ended');
  });

  socket.on('profile-pic', ({ username, image }) => {
    if (['Rav', 'Mon'].includes(username)) {
      io.emit('profile-pic-updated', { username, image });
    }
  });

  socket.on('disconnect', () => {
    for (let username in users) {
      if (users[username] && users[username].id === socket.id) {
        users[username] = null;
        io.emit('user-status', users);
        console.log(`${username} disconnected`);
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
