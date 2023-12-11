'use strict';

const SIGNAL_TYPE_JOIN = "join";
const SIGNAL_TYPE_RESP_JOIN = "resp-join";//告知加入者对方是谁
const SIGNAL_TYPE_LEAVE = "leave";
const SIGNAL_TYPE_NEW_PEER = "new-peer";
const SIGNAL_TYPE_PEER_LEAVE = "peer-leave";
const SIGNAL_TYPE_OFFER = "offer";
const SIGNAL_TYPE_ANSWER = "answer";
const SIGNAL_TYPE_CANDIDATE = "candidate";

var localUserId = Math.random().toString(36).substring(2); //本地UID
var remoteUserId = -1; //对端UID
var roomId = 0; 

var localVideo  =document.querySelector("#localVideo");
var remoteVideo  =document.querySelector("#remoteVideo");
var localStream = null; 
var remoteStream = null; 
var myRTCEngine;
var peerConn;




function createPeerConnection() {
    var defaultConfiguration = {
        bundlePolicy: "max-bundle",
        rtcpMuxPolicy: "require",
        iceTransportPolicy:"all",//先测试relay
        // 修改ice数组测试效果，需要进行封装
        iceServers: [
        {
        "urls": [
        "turn:192.168.246.128:3478?transport=udp",
        "turn:192.168.246.128:3478?transport=tcp" // 可以插入多个进行备选
                ],
                "username": "zyt",
                "credential": "f5026845"
                },
                {
                "urls": [
                "stun:192.168.246.128:3478"
                ]
                }
                ]
    };
    
    peerConn = new RTCPeerConnection(defaultConfiguration);    
    peerConn.onicecandidate = handleIceCandidate;
    peerConn.ontrack = handleRemoteStreamAdd;
    peerConn.onconnectionstatechange = handleConnectionStateChange;
    peerConn.oniceconnectionstatechange = handleIceConnectionStateChange;

    localStream.getTracks().forEach((track) => peerConn.addTrack(track, localStream));  
}

function createOfferAndSendMessage(session) {
    peerConn.setLocalDescription(session)
        .then(function () {
            var jsonMsg = {
                'cmd': 'offer',
                'roomId': roomId,
                'uid': localUserId,
                'remoteUid':remoteUserId,
                'msg': JSON.stringify(session)
            };
            var message = JSON.stringify(jsonMsg);
            myRTCEngine.sendMessage(message);
            //console.info(" send Offer message" + message);
        })
        .catch(function (error) {
            console.error("Offer setLocalDescription failed " + error);
        });
}

function createAnswerAndSendMessage(session) {
    peerConn.setLocalDescription(session)
        .then(function () {
            var jsonMsg = {
                'cmd': 'answer',
                'roomId': roomId,
                'uid': localUserId,
                'remoteUid': remoteUserId,
                'msg': JSON.stringify(session)
            };
            var message = JSON.stringify(jsonMsg);
            myRTCEngine.sendMessage(message);
            console.info(" send Answer message" + message);
        })
        .catch(function (error) {
            console.error("Answer setLocalDescription failed " + error);
        });
}
function handleCreateOfferError(error) {
    console.error("Offer setLocalDescription failed" + error);
}

function handleCreateAnswerError() {
    console.error("Answer setLocalDescription failed" + error);
}

var myRTCEngine = function(wsUrl){
    this.init(wsUrl);
    myRTCEngine = this;
    return this;
}

myRTCEngine.prototype.init = function(wsUrl){
    //设置websocket Url
    this.wsUrl = wsUrl;
    //websocket对象
    this.signaling = null;
}



myRTCEngine.prototype.createWebsocket = function(){
    myRTCEngine = this;
    myRTCEngine.signaling = new WebSocket(this.wsUrl);

    myRTCEngine.signaling.onopen = function(){
        myRTCEngine.onOpen();
    }

    myRTCEngine.signaling.onmessage = function(ev){
        myRTCEngine.onMessage(ev);
    }

    myRTCEngine.signaling.onerror = function(ev){
        myRTCEngine.onError(ev);
    }

    myRTCEngine.signaling.onclose = function(ev){
        myRTCEngine.onClose(ev);
    }
    
    // myRTCEngine.signaling.send = function(ev){
    //     myRTCEngine.sendMessage(ev);
    // }
    
}

myRTCEngine.prototype.onOpen = function(){
        console.log("websocket open");

}

myRTCEngine.prototype.onMessage = function(event){
    //console.log("onMessage" + event.data)
    var jsonMsg = JSON.parse(event.data);
    switch (jsonMsg.cmd) {
        case SIGNAL_TYPE_NEW_PEER:
            handleRemoteNewPeer(jsonMsg);
            break;
        case SIGNAL_TYPE_RESP_JOIN:
            handleResponseJoin(jsonMsg);
            break;
        case SIGNAL_TYPE_PEER_LEAVE:
            handleRemotePeerLeave(jsonMsg);
            break;
        case SIGNAL_TYPE_OFFER:
            handleRemoteOffer(jsonMsg);
            break;
        case SIGNAL_TYPE_ANSWER:
            handleRemoteAnswer(jsonMsg);
            break;
        case SIGNAL_TYPE_CANDIDATE:
            handleRemoteCandidate(jsonMsg);
            break;
    }
}

myRTCEngine.prototype.onError = function(event){
    console.log("onError" + event.data)
}

myRTCEngine.prototype.onClose = function(event){
    console.log("onClose -> code" + event.code + ",reason: " + EventTarget.reason)
}

myRTCEngine.prototype.sendMessage = function(message){
    this.signaling.send(message);
}


function openLocalStream(stream){
    console.log("websocket open"); 
    doJoin(roomId);
    localVideo.srcObject = stream;
    localStream = stream;
}

function initLocalStream(){
    navigator.mediaDevices.getUserMedia({
        audio:true,
        video:true
    })
    .then(openLocalStream)
    .catch(function(e){
        alert("getUserMedia() error" + e.name);
    });   

}

function handleRemoteNewPeer(message) {
    console.info("handleRemoteNewPeer, remoteId: " + message.remoteUid);
    remoteUserId = message.remoteUid;
    doOffer();
}

function handleResponseJoin(message) {
    console.info("handleRespnseJoin, remoteId " + message.remoteUid);
    remoteUserId = message.remoteUid;
}

function handleIceCandidate(event) {
    console.info("handleIceCondidate");
    if (event.candidate) {
                var candidateJson = {
            'label': event.candidate.sdpMLineIndex,
            'id': event.candidate.sdpMid,
            'candidate': event.candidate.candidate
        };
        var jsonMsg = {
            'cmd': 'candidate',
            'roomId': roomId,
            'uid': localUserId,
            'remoteUid': remoteUserId,
            'msg': JSON.stringify(candidateJson)
        };
        var msg = JSON.stringify(jsonMsg);
        myRTCEngine.sendMessage(msg);
        //console.info("handleIceCandidate" + msg);
    }
    else {
        console.warn("End of Candidate");
    }
    
    
}

function handleConnectionStateChange() {
    if (peerConn != null) {
        console.info("ConnectionState: " + peerConn.connectionState);
    }
}
function handleIceConnectionStateChange() {
    if (peerConn != null) {
        console.info("IceConnectionState: " + peerConn.iceConnectionState);
    }
}

function handleRemoteStreamAdd(event) {
    console.info("handleRemoteStreamAdd");
    remoteStream = event.streams[0];
    remoteVideo.srcObject = remoteStream
}

function handleRemotePeerLeave(message) {
    console.info("Remote peer has left, remoteId: " + message.remoteUid);
    remoteVideo.srcObject = null;
    if (peerConn != null) {
        peerConn.close();
        peerConn = null;
    }
    
}

function handleRemoteOffer(message) {
    console.log("handle Remote Offer");
    if (peerConn == null) {
        createPeerConnection();
    }
    var desc = JSON.parse(message.msg);
    peerConn.setRemoteDescription(desc);
    doAnswer();
}
function handleRemoteAnswer(message) {
    console.log("handle remote Answer");
    var desc = JSON.parse(message.msg);
    peerConn.setRemoteDescription(desc);
    
}
function handleRemoteCandidate(message) {
    console.log("handle remote Candididate");
    var jsonMsg = JSON.parse(message.msg);
    var candidateMsg = {
        'sdpMLineIndex': jsonMsg.label,
        'sdpMid': jsonMsg.id,
        'candidate': jsonMsg.candidate
    };
    var candidate = new RTCIceCandidate(candidateMsg);
    peerConn.addIceCandidate(candidate).catch(e => {
        console.error("addIcecandidate fialed: " + e.name);
    }
    );
    
}
function doOffer() {
    //创建RTCPeerConnection
    if (peerConn == null) {
        createPeerConnection();
    }
    peerConn.createOffer().then(createOfferAndSendMessage).catch(handleCreateOfferError);
}
/**加入 */
function doJoin(roomId){
    var jsonMsg = {
        'cmd': 'join',
        'roomId': roomId,
        'uid': localUserId

    };
    var message = JSON.stringify(jsonMsg);
    myRTCEngine.sendMessage(message);
    console.info(" send Join message" + message);
}
/**离开 */
function doLeave(roomId) {
    var jsonMsg = {
        'cmd': 'leave',
        'roomId': roomId,
        'uid': localUserId,
    };
    var msg = JSON.stringify(jsonMsg);
    myRTCEngine.sendMessage(msg);
    console.info("send Leave message" + msg);
    //挂断操作
    hangup();
}

function hangup() {
    //关闭本地显示
    localVideo.srcObject = null;
    //不显示对方
    remoteVideo.srcObject = null;
    closeLocalStream();
    if (peerConn != null) {
        peerConn.close();
        peerConn = null;
    }
}

function closeLocalStream() {
    if (localStream != null) {
        localStream.getTracks().forEach((track) => {
            track.stop(); 
        });
    }
}
function doAnswer() {
    peerConn.createAnswer().then(createAnswerAndSendMessage).catch(handleCreateAnswerError);

}

myRTCEngine = new myRTCEngine("ws://10.29.235.34:8010");
myRTCEngine.createWebsocket();

document.getElementById('joinBtn').onclick = function(){
    roomId = document.getElementById("RoomId").value;
    if(roomId == ""){
        alert("请输入房间id");
        return;
    }
    console.log("加入按钮被点击");
    //初始化本地码流
    initLocalStream();
}

document.getElementById('leaveBtn').onclick = function(){
    console.log("离开按钮被点击");
    doLeave(roomId);

}

