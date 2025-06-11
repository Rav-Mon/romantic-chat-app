const socket = io('https://romantic-chat-app.onrender.com'); // Replace with Render backend URL after deployment
let peer = null;
let currentCall = null;
let callTimerInterval = null;
let username = null;
let stream = null;

const loginScreen = document.getElementById('login-screen');
const chatScreen = document.getElementById('chat-screen');
const messagesDiv = document.getElementById('messages');
const messageInput = document.getElementById('message-input');
const fileInput = document.getElementById('file-input');
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
const callScreen = document.getElementById('call-screen');
const incomingCallDiv = document.getElementById('incoming-call');
const callTypeSpan = document.getElementById('call-type');
const callerSpan = document.getElementById('caller');
const callTimer = document.getElementById('call-timer');
const profilePic = document.getElementById('profile-pic');
const profilePicInput = document.getElementById('profile-pic-input');

function login(user) {
  username = user;
  socket.emit('login', username);
}

socket.on('login-success', ({ username: user, messages }) => {
  loginScreen.style.display = 'none';
  chatScreen.style.display = 'flex';
  messages.forEach(displayMessage);
  initPeer();
});

socket.on('login-failed', () => alert('User already logged in or invalid!'));

function initPeer() {
  peer = new Peer({
    config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }
  });
  peer.on('open', id => {
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(s => {
        stream = s;
        localVideo.srcObject = stream;
      })
      .catch(err => console.error('Media error:', err));
  });

  peer.on('call', call => {
    currentCall = call;
    call.answer(stream);
    call.on('stream', remoteStream => {
      remoteVideo.srcObject = remoteStream;
      startCallTimer();
    });
  });
}

function startCall(type) {
  const to = username === 'Rav' ? 'Mon' : 'Rav';
  socket.emit('call-user', { to, type });
  callScreen.style.display = 'flex';
  if (type === 'voice') {
    localVideo.style.display = 'none';
    remoteVideo.style.display = 'none';
  } else {
    localVideo.style.display = 'block';
    remoteVideo.style.display = 'block';
  }
}

socket.on('incoming-call', ({ from, username: caller, type }) => {
  incomingCallDiv.style.display = 'block';
  callTypeSpan.textContent = type;
  callerSpan.textContent = caller;
  incomingCallDiv.dataset.from = from;
  incomingCallDiv.dataset.type = type;
});

function acceptCall() {
  const from = incomingCallDiv.dataset.from;
  const type = incomingCallDiv.dataset.type;
  socket.emit('accept-call', { to: from });
  incomingCallDiv.style.display = 'none';
  callScreen.style.display = 'flex';
  if (type === 'voice') {
    localVideo.style.display = 'none';
    remoteVideo.style.display = 'none';
  } else {
    localVideo.style.display = 'block';
    remoteVideo.style.display = 'block';
  }
  const call = peer.call(from, stream);
  currentCall = call;
  call.on('stream', remoteStream => {
    remoteVideo.srcObject = remoteStream;
    startCallTimer();
  });
}

function rejectCall() {
  socket.emit('reject-call', { to: incomingCallDiv.dataset.from });
  incomingCallDiv.style.display = 'none';
}

socket.on('call-accepted', () => {
  const to = username === 'Rav' ? 'Mon' : 'Rav';
  const call = peer.call(users[to].id, stream);
  currentCall = call;
  call.on('stream', remoteStream => {
    remoteVideo.srcObject = remoteStream;
    startCallTimer();
  });
});

socket.on('call-rejected', () => {
  alert('Call rejected');
  callScreen.style.display = 'none';
});

function endCall() {
  if (currentCall) {
    currentCall.close();
    currentCall = null;
  }
  socket.emit('end-call', { to: username === 'Rav' ? 'Mon' : 'Rav' });
  callScreen.style.display = 'none';
  stopCallTimer();
}

socket.on('call-ended', () => {
  if (currentCall) {
    currentCall.close();
    currentCall = null;
  }
  callScreen.style.display = 'none';
  stopCallTimer();
});

function startCallTimer() {
  let seconds = 0;
  callTimerInterval = setInterval(() => {
    seconds++;
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    callTimer.textContent = `${mins}:${secs}`;
  }, 1000);
}

function stopCallTimer() {
  if (callTimerInterval) {
    clearInterval(callTimerInterval);
    callTimerInterval = null;
    callTimer.textContent = '00:00';
  }
}

function sendMessage() {
  const text = messageInput.value.trim();
  const file = fileInput.files[0];
  if (text || file) {
    if (file && file.size > 5 * 1024 * 1024) {
      alert('File size must be less than 5MB');
      return;
    }
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        socket.emit('message', { username, text, file: reader.result, fileName: file.name });
      };
      reader.readAsDataURL(file);
    } else {
      socket.emit('message', { username, text });
    }
    messageInput.value = '';
    fileInput.value = '';
  }
}

socket.on('message', message => displayMessage(message));

socket.on('messages-updated', messages => {
  messagesDiv.innerHTML = '';
  messages.forEach(displayMessage);
});

function displayMessage({ id, username: sender, text, file, fileName, timestamp }) {
  const div = document.createElement('div');
  div.className = `message ${sender === username ? 'me' : 'other'}`;
  if (text) {
    const textP = document.createElement('p');
    textP.textContent = text;
    div.appendChild(textP);
  }
  if (file) {
    const link = document.createElement('a');
    link.href = file;
    link.download = fileName;
    link.textContent = `Download ${fileName}`;
    div.appendChild(link);
  }
  const timeP = document.createElement('p');
  timeP.className = 'timestamp';
  timeP.textContent = new Date(timestamp).toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
  div.appendChild(timeP);
  if (sender === username) {
    const deleteSpan = document.createElement('span');
    deleteSpan.className = 'delete';
    deleteSpan.textContent = '✖';
    deleteSpan.onclick = () => socket.emit('delete-message', id);
    div.appendChild(deleteSpan);
  }
  messagesDiv.appendChild(div);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

socket.on('user-status', users => {
  document.getElementById('rav-status').textContent = `Rav: ${users.Rav?.connected ? 'Online' : 'Offline'}`;
  document.getElementById('rav-status').className = `status ${users.Rav?.connected ? 'online' : 'offline'}`;
  document.getElementById('mon-status').textContent = `Mon: ${users.Mon?.connected ? 'Online' : 'Offline'}`;
  document.getElementById('mon-status').className = `status ${users.Mon?.connected ? 'online' : 'offline'}`;
});

profilePicInput.onchange = () => {
  const file = profilePicInput.files[0];
  if (file && file.size > 2 * 1024 * 1024) {
    alert('Image size must be less than 2MB');
    return;
  }
  if (file) {
    const reader = new FileReader();
    reader.onload = () => {
      profilePic.src = reader.result;
      socket.emit('profile-pic', { username, image: reader.result });
    };
    reader.readAsDataURL(file);
  }
};

socket.on('profile-pic-updated', ({ username: user, image }) => {
  if (user === username) {
    profilePic.src = image;
  }
});
