const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server, {
  cors: {
    origin: 'https://romantic-chat-frontend.onrender.com',
    methods: ['GET', 'POST'],
    credentials: true
  }
});
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');

app.use(express.static('public'));

// Manual CORS middleware
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', 'https://romantic-chat-frontend.onrender.com');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS request for:', req.url);
    return res.status(200).end();
  }
  console.log(`Request: ${req.method} ${req.url}`);
  next();
});

app.get('/ice', async (req, res) => {
  try {
    console.log('Fetching ICE servers from Xirsys');
    const response = await axios.put(
      'https://global.xirsys.net/_turn/romantic-chat/default/rav-mon',
      {},
      {
        auth: {
          username: 'ravmon',
          password: '73ed7774-4765-11f0-a911-0242ac150002'
        }
      }
    );
    console.log('ICE servers fetched:', response.data.v.iceServers);
    res.json(response.data.v.iceServers);
  } catch (err) {
    console.error('Xirsys error:', err.message);
    res.status(500).json({ error: 'Failed to get ICE servers' });
  }
});
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
    if (users[to] && users[to].connected && users[to].peerId) {
      io.to(users[to].id).emit('incoming-call', {
        from: users[Object.keys(users).find(u => users[u].id === socket.id)].peerId,
        username: Object.keys(users).find(key => users[key].id === socket.id),
        type,
        offer
      });
    } else {
      socket.emit('call-failed', `User ${to} is not available`);
    }
  });

  socket.on('call-answer', ({ to, answer }) => {
    const toUser = Object.keys(users).find(u => users[u]?.peerId === to);
    if (toUser && users[toUser] && users[toUser].connected) {
      io.to(users[toUser].id).emit('call-answered', { answer });
    }
  });

  socket.on('ice-candidate', ({ to, candidate }) => {
    const toUser = Object.keys(users).find(u => users[u]?.peerId === to);
    if (toUser && users[toUser] && users[toUser].connected) {
      io.to(users[toUser].id).emit('ice-candidate', { candidate });
    }
  });

  socket.on('accept-call', ({ to }) => {
    const toUser = Object.keys(users).find(u => users[u]?.peerId === to);
    if (toUser && users[toUser] && users[toUser].connected) {
      io.to(users[toUser].id).emit('call-accepted');
    }
  });

  socket.on('reject-call', ({ to }) => {
    const toUser = Object.keys(users).find(u => users[u]?.peerId === to);
    if (toUser && users[toUser] && users[toUser].connected) {
      io.to(users[toUser].id).emit('call-rejected');
    }
  });

  socket.on('end-call', ({ to }) => {
    const toUser = Object.keys(users).find(u => users[u]?.peerId === to);
    if (toUser && users[toUser] && users[toUser].connected) {
      io.to(users[toUser].id).emit('call-ended');
    }
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
