let localStream;
let screenStream = null;
let peers = {};
let dataConns = {};
let nickname = "";
let peer;
let roomCode = "";
let isHost = false;
let kicked = false;


let connectedPeers = new Set();


function hostRoom() {
  nickname = document.getElementById("nickname").value.trim();
  if (!nickname) return alert("Please enter a nickname");
  isHost = true;
  roomCode = generateRoomCode(20);
  startPeer();
}


function joinRoom() {
  nickname = document.getElementById("nickname").value.trim();
  roomCode = document.getElementById("joinCode").value.trim();
  if (!nickname || !roomCode) return alert("Please enter nickname and room code");
  isHost = false;
  startPeer();
}


function generateRoomCode(length) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}


function startPeer() {
  const myId = `${roomCode}-${isHost ? "host" : nickname}`;
  peer = new Peer(myId);


  peer.on("open", () => {
    document.getElementById("login").style.display = "none";
    document.getElementById("call").style.display = "block";


    const roomDisplay = document.getElementById("roomDisplay");
    roomDisplay.innerText = roomCode;
    roomDisplay.style.cursor = "pointer";
    roomDisplay.title = "Click to copy";
    roomDisplay.onclick = () => {
      navigator.clipboard.writeText(roomCode).then(() => {
        roomDisplay.innerText = roomCode + " ✓";
        setTimeout(() => (roomDisplay.innerText = roomCode), 1000);
      });
    };


    if (isHost) document.getElementById("kickSection").style.display = "block";


    navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then((stream) => {
      localStream = stream;
      addVideo(peer.id, stream, true);
      connectedPeers.add(peer.id);


      peer.on("call", (call) => {
        call.answer(screenStream || localStream);
        call.on("stream", (userStream) => {
          addVideo(call.peer, userStream);
          peers[call.peer] = call;
          connectedPeers.add(call.peer);
          connectToNewPeers();
        });
      });


      peer.on("connection", (conn) => {
        dataConns[conn.peer] = conn;
        connectedPeers.add(conn.peer);


        conn.on("data", (msg) => {
          if (msg === "disconnect-me") {
            if (peers[conn.peer]) peers[conn.peer].close();
            removeVideo(conn.peer);
            conn.close();
            delete dataConns[conn.peer];
            connectedPeers.delete(conn.peer);
          } else if (msg.type === "peers-list") {
            msg.peers.forEach((p) => {
              if (p !== peer.id && !connectedPeers.has(p)) {
                connectToPeer(p, screenStream || localStream);
              }
            });
          } else if (msg.type === "cam-toggle") {
            const container = document.getElementById(`vid-container-${msg.peerId}`);
            if (container) {
              if (msg.enabled) container.classList.remove("camera-off");
              else container.classList.add("camera-off");
            }
          } else if (msg.type === "mic-toggle") {
            updateMicIcon(msg.peerId, msg.enabled);
          } else if (msg.type === "screenshare-toggle") {
            updateScreenShareUI(msg.peerId, msg.enabled);
          } else if (typeof msg === "string" && msg.startsWith("chat:")) {
            displayChat(msg.slice(5), false);
          }
        });


        conn.on("close", () => {
          if (peers[conn.peer]) peers[conn.peer].close();
          removeVideo(conn.peer);
          delete dataConns[conn.peer];
          connectedPeers.delete(conn.peer);
        });
      });


      if (!isHost) {
        // Join: Connect to host
        const call = peer.call(`${roomCode}-host`, screenStream || localStream);
        call.on("stream", (userStream) => {
          addVideo(call.peer, userStream);
          peers[call.peer] = call;
          connectedPeers.add(call.peer);
        });


        const conn = peer.connect(`${roomCode}-host`);
        dataConns[`${roomCode}-host`] = conn;


        conn.on("open", () => {
          conn.send({ type: "peers-list", peers: Array.from(connectedPeers) });
        });


        conn.on("data", (msg) => {
          if (msg === "kick" && !kicked) {
            kicked = true;
            endCall("The host has kicked you out the call. Refresh the page to start a new one.");
          } else if (msg.type === "peers-list") {
            msg.peers.forEach((p) => {
              if (p !== peer.id && !connectedPeers.has(p)) {
                connectToPeer(p, screenStream || localStream);
              }
            });
          } else if (msg.type === "cam-toggle") {
            const container = document.getElementById(`vid-container-${msg.peerId}`);
            if (container) {
              if (msg.enabled) container.classList.remove("camera-off");
              else container.classList.add("camera-off");
            }
          } else if (msg.type === "mic-toggle") {
            updateMicIcon(msg.peerId, msg.enabled);
          } else if (msg.type === "screenshare-toggle") {
            updateScreenShareUI(msg.peerId, msg.enabled);
          } else if (typeof msg === "string" && msg.startsWith("chat:")) {
            displayChat(msg.slice(5), false);
          }
        });


        conn.on("close", () => {
          if (!kicked)
            endCall("The host has kicked you out the call. Refresh the page to start a new one.");
        });
      }


      function connectToNewPeers() {
        for (let id in dataConns) {
          if (dataConns[id].open) {
            dataConns[id].send({ type: "peers-list", peers: Array.from(connectedPeers) });
          }
        }
      }


      function connectToPeer(peerId, stream) {
        if (peerId === peer.id || peers[peerId]) return;


        const conn = peer.connect(peerId);
        conn.on("open", () => {
          dataConns[peerId] = conn;
          connectedPeers.add(peerId);
          connectToNewPeers();


          conn.on("data", (msg) => {
            if (msg === "kick" && !kicked) {
              kicked = true;
              endCall("The host has kicked you out the call. Refresh the page to start a new one.");
            } else if (msg.type === "cam-toggle") {
              const container = document.getElementById(`vid-container-${msg.peerId}`);
              if (container) {
                if (msg.enabled) container.classList.remove("camera-off");
                else container.classList.add("camera-off");
              }
            } else if (msg.type === "mic-toggle") {
              updateMicIcon(msg.peerId, msg.enabled);
            } else if (msg.type === "screenshare-toggle") {
              updateScreenShareUI(msg.peerId, msg.enabled);
            } else if (typeof msg === "string" && msg.startsWith("chat:")) {
              displayChat(msg.slice(5), false);
            }
          });


          conn.on("close", () => {
            removeVideo(peerId);
            delete dataConns[peerId];
            connectedPeers.delete(peerId);
          });
        });


        const call = peer.call(peerId, stream);
        call.on("stream", (userStream) => {
          addVideo(call.peer, userStream);
          peers[call.peer] = call;
          connectedPeers.add(call.peer);
        });
      }


      createChatUI();
    });
  });
}


function addVideo(id, stream, mute = false) {
  if (document.getElementById(`vid-container-${id}`)) return;


  const container = document.createElement("div");
  container.id = `vid-container-${id}`;
  container.style.display = "inline-flex";
  container.style.flexDirection = "column";
  container.style.alignItems = "center";
  container.style.margin = "10px";
  container.style.position = "relative";


  const vid = document.createElement("video");
  vid.srcObject = stream;
  vid.autoplay = true;
  vid.muted = mute;
  vid.id = `vid-${id}`;
  vid.style.borderRadius = "8px";
  vid.style.objectFit = "cover";
  vid.style.width = "300px";
  vid.style.height = "200px";


  container.appendChild(vid);


  const label = document.createElement("div");
  label.id = `label-${id}`;
  label.innerText = id.split("-")[1] || "User";
  label.style.marginTop = "6px";
  label.style.background = "#333";
  label.style.padding = "4px 10px";
  label.style.borderRadius = "5px";
  label.style.fontSize = "14px";
  label.style.color = "white";
  label.style.display = "flex";
  label.style.alignItems = "center";


  const micIcon = document.createElement("span");
  micIcon.id = `mic-${id}`;
  micIcon.style.marginLeft = "6px";
  micIcon.style.color = "#ff5252";
  micIcon.innerText = "";
  label.appendChild(micIcon);


  container.appendChild(label);


  document.getElementById("videos").appendChild(container);


  // Set initial camera off class
  const videoTrack = stream.getVideoTracks()[0];
  if (videoTrack) {
    if (!videoTrack.enabled) {
      container.classList.add("camera-off");
    }
  }
}


function removeVideo(id) {
  const el = document.getElementById(`vid-container-${id}`);
  if (el) el.remove();
}


function toggleCam() {
  const videoTrack = (screenStream ? screenStream : localStream).getVideoTracks()[0];
  const newState = !videoTrack.enabled;
  videoTrack.enabled = newState;


  const container = document.getElementById(`vid-container-${peer.id}`);
  if (container) {
    if (newState) {
      container.classList.remove("camera-off");
    } else {
      container.classList.add("camera-off");
    }
  }


  for (let id in dataConns) {
    if (dataConns[id].open) {
      dataConns[id].send({
        type: "cam-toggle",
        peerId: peer.id,
        enabled: newState,
      });
    }
  }
}


function toggleMic() {
  const audioTrack = localStream.getAudioTracks()[0];
  audioTrack.enabled = !audioTrack.enabled;


  updateMicIcon(peer.id, audioTrack.enabled);


  for (let id in dataConns) {
    if (dataConns[id].open) {
      dataConns[id].send({
        type: "mic-toggle",
        peerId: peer.id,
        enabled: audioTrack.enabled,
      });
    }
  }
}


function updateMicIcon(id, enabled) {
  const micIcon = document.getElementById(`mic-${id}`);
  if (micIcon) micIcon.innerText = enabled ? "" : "🔇";
}


async function startScreenShare() {
  if (screenStream) return;


  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    const screenTrack = screenStream.getVideoTracks()[0];


    for (const id in peers) {
      const senders = peers[id].peerConnection.getSenders();
      const sender = senders.find(s => s.track && s.track.kind === "video");
      if (sender) {
        await sender.replaceTrack(screenTrack);
      }
    }


    replaceLocalVideo(screenStream);


    screenTrack.onended = () => {
      stopScreenShare();
    };


    broadcastData({
      type: "screenshare-toggle",
      peerId: peer.id,
      enabled: true,
    });
  } catch (err) {
    alert("Failed to start screen share: " + err.message);
  }
}


async function stopScreenShare() {
  if (!screenStream) return;


  const videoTrack = localStream.getVideoTracks()[0];


  for (const id in peers) {
    const senders = peers[id].peerConnection.getSenders();
    const sender = senders.find(s => s.track && s.track.kind === "video");
    if (sender) {
      await sender.replaceTrack(videoTrack);
    }
  }


  replaceLocalVideo(localStream);


  broadcastData({
    type: "screenshare-toggle",
    peerId: peer.id,
    enabled: false,
  });


  screenStream.getTracks().forEach(track => track.stop());
  screenStream = null;
}


function replaceLocalVideo(newStream) {
  const videoElem = document.getElementById(`vid-${peer.id}`);
  if (!videoElem) return;
  videoElem.srcObject = newStream;
}


function broadcastData(msg) {
  for (let id in dataConns) {
    if (dataConns[id].open) {
      dataConns[id].send(msg);
    }
  }
}


function updateScreenShareUI(peerId, enabled) {
  const container = document.getElementById(`vid-container-${peerId}`);
  if (!container) return;
  if (enabled) {
    container.style.border = "3px solid #0f0";
  } else {
    container.style.border = "none";
  }
}


function endCall(message = "Call ended. Refresh the page to start a new call.") {
  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
  }
  if (screenStream) {
    screenStream.getTracks().forEach(t => t.stop());
  }


  for (const id in peers) {
    peers[id].close();
  }
  peers = {};
  for (const id in dataConns) {
    dataConns[id].close();
  }
  dataConns = {};
  connectedPeers.clear();


  document.getElementById("videos").innerHTML = "";
  document.getElementById("call").style.display = "none";
  document.getElementById("login").style.display = "block";


  if (message) alert(message);
}


function kickUser() {
  const name = document.getElementById("kickName").value.trim();
  if (!name) return alert("Enter nickname to kick");
  const targetId = `${roomCode}-${name}`;
  const conn = dataConns[targetId];
  if (!conn) return alert("User not found or not connected");
  conn.send("kick");
  conn.close();
  if (peers[targetId]) peers[targetId].close();
  removeVideo(targetId);
  delete dataConns[targetId];
  connectedPeers.delete(targetId);
}


function createChatUI() {
  const toggleBtn = document.createElement("button");
  toggleBtn.id = "chatToggleBtn";
  toggleBtn.innerText = "Toggle Chat";
  toggleBtn.style.marginTop = "10px";
  toggleBtn.style.position = "relative";
  toggleBtn.style.display = "inline-block";


  toggleBtn.onclick = () => {
    const box = document.getElementById("chatBox");
    if (box.style.display === "none") {
      box.style.display = "flex";
      hideBlueDot();
    } else {
      box.style.display = "none";
    }
  };


  // Blue dot outside button
  const blueDot = document.createElement("span");
  blueDot.id = "chatNotificationDot";
  blueDot.style.width = "12px";
  blueDot.style.height = "12px";
  blueDot.style.backgroundColor = "#0b3d91"; // Darker blue
  blueDot.style.borderRadius = "50%";
  blueDot.style.display = "none";
  blueDot.style.marginLeft = "8px";
  blueDot.style.verticalAlign = "middle";
  blueDot.style.display = "inline-block";


  const chatToggleWrapper = document.createElement("div");
  chatToggleWrapper.style.marginTop = "10px";
  chatToggleWrapper.style.textAlign = "center";
  chatToggleWrapper.appendChild(toggleBtn);
  chatToggleWrapper.appendChild(blueDot);


  const box = document.createElement("div");
  box.id = "chatBox";
  box.style.width = "220px";
  box.style.height = "150px";
  box.style.margin = "10px auto";
  box.style.background = "#222";
  box.style.color = "white";
  box.style.padding = "5px";
  box.style.overflowY = "auto";
  box.style.borderRadius = "10px";
  box.style.display = "none";
  box.style.flexDirection = "column";
  box.style.justifyContent = "space-between";
  box.style.fontFamily = "sans-serif";
  box.style.fontSize = "13px";


  const messages = document.createElement("div");
  messages.id = "chatMessages";
  messages.style.flex = "1";
  messages.style.overflowY = "auto";
  box.appendChild(messages);


  const form = document.createElement("form");
  form.style.display = "flex";
  form.style.marginTop = "4px";


  const input = document.createElement("input");
  input.id = "chatInput";
  input.placeholder = "Message...";
  input.style.flex = "1";
  input.style.padding = "3px";
  input.style.fontSize = "12px";
  input.style.borderRadius = "4px";
  input.style.border = "none";


  const btn = document.createElement("button");
  btn.innerText = "Send";
  btn.type = "submit";
  btn.style.marginLeft = "4px";
  btn.style.padding = "3px";
  btn.style.fontSize = "12px";
  btn.style.borderRadius = "4px";
  btn.style.cursor = "pointer";


  form.appendChild(input);
  form.appendChild(btn);
  box.appendChild(form);


  form.onsubmit = (e) => {
    e.preventDefault();
    const msg = input.value.trim();
    if (!msg) return;
    displayChat(`${nickname}: ${msg}`, true);
    for (let id in dataConns) {
      if (dataConns[id].open) dataConns[id].send("chat:" + nickname + ": " + msg);
    }
    input.value = "";
    playDing();
  };


  document.getElementById("main").appendChild(chatToggleWrapper);
  document.getElementById("main").appendChild(box);
}


function hideBlueDot() {
  const blueDot = document.getElementById("chatNotificationDot");
  if (blueDot) blueDot.style.display = "none";
}


function displayChat(message, isLocal) {
  const box = document.getElementById("chatBox");
  const messages = document.getElementById("chatMessages");
  if (!box || !messages) return;


  if (box.style.display === "none" && !isLocal) {
    const blueDot = document.getElementById("chatNotificationDot");
    if (blueDot) blueDot.style.display = "inline-block";
  }


  const msgDiv = document.createElement("div");
  msgDiv.innerText = message;
  msgDiv.style.marginBottom = "4px";
  if (isLocal) {
    msgDiv.style.color = "#0f0";
  } else {
    msgDiv.style.color = "#ddd";
  }
  messages.appendChild(msgDiv);
  messages.scrollTop = messages.scrollHeight;
}


function playDing() {
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const oscillator = audioCtx.createOscillator();
  oscillator.type = "triangle";
  oscillator.frequency.setValueAtTime(1200, audioCtx.currentTime);
  oscillator.connect(audioCtx.destination);
  oscillator.start();
  oscillator.stop(audioCtx.currentTime + 0.1);
}



