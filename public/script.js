let username = null;
const socket = io('https://romantic-chat-app.onrender.com', { transports: ['websocket'] });
let peer = null;
let currentCall = null;
let callTimerInterval = null;
let stream = null;
let isCalling = false;

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
const loginButtons = loginScreen.querySelectorAll('button');

function showConnecting(show) {
  loginButtons.forEach(btn => btn.disabled = show);
  const status = document.getElementById('connection-status') || document.createElement('p');
  status.id = 'connection-status';
  status.textContent = show ? 'Connecting to server...' : '';
  status.style.color = '#25D366';
  status.style.textAlign = 'center';
  if (show && !status.parentElement) {
    loginScreen.appendChild(status);
  } else if (!show && status.parentElement) {
    status.remove();
  }
}

socket.on('connect', () => {
  console.log('Socket.IO connected');
  showConnecting(false);
});

socket.on('connect_error', (err) => {
  console.error('Socket.IO connection error:', err.message);
  showConnecting(false);
  alert(`Connection failed: ${err.message}. Please check your internet or try again later.`);
});

socket.on('call-failed', (message) => {
  alert(message);
  callScreen.style.display = 'none';
  isCalling = false;
});

function login(user) {
  showConnecting(true);
  username = user;
  socket.emit('login', username);
}

socket.on('login-success', ({ username: user, messages }) => {
  console.log('Login successful:', user);
  showConnecting(false);
  loginScreen.style.display = 'none';
  chatScreen.style.display = 'flex';
  messages.forEach(displayMessage);
  initPeer();
});

socket.on('login-failed', (message) => {
  console.log('Login failed:', message);
  showConnecting(false);
  alert(message || 'Login failed!');
});

function initPeer() {
  const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ];
  console.log('Using ICE servers:', iceServers);
  peer = new Peer({
    config: { iceServers },
    secure: true,
    debug: 3
  });
  setupPeer();
}

function setupPeer() {
  peer.on('open', id => {
    console.log('PeerJS ID:', id);
    socket.emit('peer-id', id);
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(s => {
        stream = s;
        localVideo.srcObject = stream;
        stream.getAudioTracks().forEach(track => track.enabled = true);
        stream.getVideoTracks().forEach(track => track.enabled = true);
        console.log('Local stream ready');
      })
      .catch(err => {
        console.error('Media error:', err.message);
        alert('Please allow camera/mic permissions.');
      });
  });

  peer.on('call', call => {
    console.log('Receiving call');
    if (!stream) {
      console.warn('No local stream yet, delaying answer');
      setTimeout(() => {
        if (stream) call.answer(stream);
      }, 1000);
      return;
    }
    currentCall = call;
    call.answer(stream);
    setupCallHandlers(call);
  });

  peer.on('error', err => {
    console.error('PeerJS error:', err);
    alert(`PeerJS error: ${err.type}. Please try again.`);
    isCalling = false;
  });
}

function setupCallHandlers(call) {
  call.on('stream', remoteStream => {
    console.log('Received remote stream');
    remoteVideo.srcObject = remoteStream;
    remoteStream.getAudioTracks().forEach(track => track.enabled = true);
    remoteStream.getVideoTracks().forEach(track => track.enabled = true);
    startCallTimer();
  });
  call.on('error', err => console.error('WebRTC call error:', err));
  call.on('close', () => {
    console.log('Call closed');
    endCall();
  });
}

function startCall(type) {
  if (isCalling) {
    alert('A call is already in progress.');
    return;
  }
  isCalling = true;
  const to = username === 'Rav' ? 'Mon' : 'Rav';
  console.log(`Starting ${type} call to ${to}`);
  if (!stream) {
    alert('Camera/mic not ready. Please allow permissions and try again.');
    isCalling = false;
    return;
  }
  callScreen.style.display = 'flex';
  if (type === 'voice') {
    localVideo.style.display = 'none';
    remoteVideo.style.display = 'none';
  } else {
    localVideo.style.display = 'block';
    remoteVideo.style.display = 'block';
  }
  const call = peer.call(to, stream);
  if (!call) {
    alert('Failed to initiate call. Please try again.');
    isCalling = false;
    callScreen.style.display = 'none';
    return;
  }
  currentCall = call;
  setupCallHandlers(call);
  call.peerConnection.onicecandidate = event => {
    if (event.candidate) {
      socket.emit('ice-candidate', { to, candidate: event.candidate });
    }
  };
  call.peerConnection.createOffer()
    .then(offer => call.peerConnection.setLocalDescription(offer))
    .then(() => {
      socket.emit('call-user', { to, type, offer: call.peerConnection.localDescription });
    })
    .catch(err => {
      console.error('Offer creation error:', err);
      isCalling = false;
      callScreen.style.display = 'none';
    });
}

socket.on('incoming-call', ({ from, username: caller, type, offer }) => {
  console.log(`Incoming ${type} call from ${caller}`);
  incomingCallDiv.style.display = 'block';
  callTypeSpan.textContent = type;
  callerSpan.textContent = caller;
  incomingCallDiv.dataset.from = from;
  incomingCallDiv.dataset.type = type;
  incomingCallDiv.dataset.offer = JSON.stringify(offer);
});

socket.on('call-answered', ({ answer }) => {
  if (currentCall) {
    currentCall.peerConnection.setRemoteDescription(new RTCSessionDescription(answer))
      .catch(err => console.error('Set remote description error:', err));
  }
});

socket.on('ice-candidate', ({ candidate }) => {
  if (currentCall) {
    currentCall.peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
      .catch(err => console.error('Error adding ICE candidate:', err));
  }
});

function acceptCall() {
  if (isCalling) {
    alert('A call is already in progress.');
    return;
  }
  isCalling = true;
  const from = incomingCallDiv.dataset.from;
  const type = incomingCallDiv.dataset.type;
  const offer = JSON.parse(incomingCallDiv.dataset.offer);
  console.log(`Accepting ${type} call from ${from}`);
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
  if (!stream) {
    alert('Camera/mic not ready. Please allow permissions and try again.');
    isCalling = false;
    callScreen.style.display = 'none';
    return;
  }
  const call = peer.call(from, stream);
  if (!call) {
    alert('Failed to initiate call. Please try again.');
    isCalling = false;
    callScreen.style.display = 'none';
    return;
  }
  currentCall = call;
  call.peerConnection.setRemoteDescription(new RTCSessionDescription(offer))
    .then(() => call.peerConnection.createAnswer())
    .then(answer => call.peerConnection.setLocalDescription(answer))
    .then(() => {
      socket.emit('call-answer', { to: from, answer: call.peerConnection.localDescription });
    })
    .catch(err => {
      console.error('Answer creation error:', err);
      isCalling = false;
      callScreen.style.display = 'none';
    });
  setupCallHandlers(call);
  call.peerConnection.onicecandidate = event => {
    if (event.candidate) {
      socket.emit('ice-candidate', { to: from, candidate: event.candidate });
    }
  };
}

function rejectCall() {
  const from = incomingCallDiv.dataset.from;
  socket.emit('reject-call', { to: from });
  incomingCallDiv.style.display = 'none';
  isCalling = false;
}

socket.on('call-accepted', () => {
  console.log('Call accepted');
});

socket.on('call-rejected', () => {
  alert('Call rejected');
  callScreen.style.display = 'none';
  isCalling = false;
});

function endCall() {
  if (currentCall) {
    currentCall.close();
    currentCall = null;
  }
  socket.emit('end-call', { to: username === 'Rav' ? 'Mon' : 'Rav' });
  callScreen.style.display = 'none';
  stopCallTimer();
  isCalling = false;
}

socket.on('call-ended', () => {
  if (currentCall) {
    currentCall.close();
    currentCall = null;
  }
  callScreen.style.display = 'none';
  stopCallTimer();
  isCalling = false;
});

function startCallTimer() {
  console.log('Starting call timer');
  clearInterval(callTimerInterval);
  let seconds = 0;
  callTimerInterval = setInterval(() => {
    seconds++;
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    callTimer.textContent = `${mins}:${secs}`;
  }, 1000);
}

function stopCallTimer() {
  console.log('Stopping call timer');
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
    link.textContent = `📎 ${fileName}`;
    link.className = 'file-link';
    div.appendChild(link);
  }
  const timeP = document.createElement('p');
  timeP.className = 'timestamp';
  timeP.textContent = new Date(timestamp).toLocaleString('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: 'numeric', hour12: true });
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
  document.getElementById('rav-status').textContent = users.Rav?.connected ? '🟢' : '🔴';
  document.getElementById('mon-status').textContent = users.Mon?.connected ? '🟢' : '🔴';
});

if (profilePicInput) {
  profilePicInput.onchange = () => {
    const file = profilePicInput.files[0];
    if (file && file.size > 2 * 1024 * 1024) {
      alert('Image size must be less than 2MB');
      return;
    }
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          profilePic.src = reader.result;
          socket.emit('profile-pic', { username, image: reader.result });
        };
        img.onerror = () => {
          alert('Invalid image file. Reverting to default.');
          profilePic.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHegJ3bQe1PwAAAABJRU5ErkJggg==';
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    }
  };
}

socket.on('profile-pic-updated', ({ username: user, image }) => {
  if (user === username) {
    const img = new Image();
    img.onload = () => {
      profilePic.src = image;
    };
    img.onerror = () => {
      profilePic.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHegJ3bQe1PwAAAABJRU5ErkJggg==';
    };
    img.src = image || 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHegJ3bQe1PwAAAABJRU5ErkJggg==';
  }
});
