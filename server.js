const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server, { cors: { origin: '*' } });
const { v4: uuidv4 } = require('uuid');

app.use(express.static('public'));

const users = { 'Rav': null, 'Mon': null };
const messages = [];

io.on('connection', socket => {
  socket.on('login', username => {
    if (users[username] && !users[username].connected) {
      users[username] = { id: socket.id, connected: true };
      socket.emit('login-success', { username, messages });
      io.emit('user-status', users);
    } else {
      socket.emit('login-failed');
    }
  });

  socket.on('message', ({ username, text, file, fileName }) => {
    const message = { id: uuidv4(), username, text, file, fileName, timestamp: new Date().toISOString() };
    messages.push(message);
    io.emit('message', message);
  });

  socket.on('delete-message', messageId => {
    const index = messages.findIndex(msg => msg.id === messageId);
    if (index !== -1) {
      messages.splice(index, 1);
      io.emit('messages-updated', messages);
    }
  });

  socket.on('signal', data => {
    io.to(data.to).emit('signal', { ...data, from: socket.id });
  });

  socket.on('call-user', ({ to, type }) => {
    io.to(users[to].id).emit('incoming-call', { from: socket.id, username: Object.keys(users).find(key => users[key].id === socket.id), type });
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
    io.emit('profile-pic-updated', { username, image });
  });

  socket.on('disconnect', () => {
    for (let username in users) {
      if (users[username] && users[username].id === socket.id) {
        users[username].connected = false;
        io.emit('user-status', users);
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
