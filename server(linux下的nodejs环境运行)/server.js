var ws = require("nodejs-websocket");
var port = 8010;
var user = 0;

const SIGNAL_TYPE_JOIN = "join";
/** 当join房间后发现房间已经存在另一个人时则返回另一个人的uid, 如果只有自己则不返回。 其实就是告知加入者对方是谁 */
const SIGNAL_TYPE_RESP_JOIN = "resp-join";
const SIGNAL_TYPE_LEAVE = "leave";
const SIGNAL_TYPE_NEW_PEER = "new-peer";
const SIGNAL_TYPE_PEER_LEAVE = "peer-leave";
const SIGNAL_TYPE_OFFER = "offer";
const SIGNAL_TYPE_ANSWER = "answer";
const SIGNAL_TYPE_CANDIDATE = "candidate";


/**这是一个预定义的类型，可以理解为java中的Map */
var myRTCMap = function () {
    /**Map底层的key-value数组。*/
    this._entrys = new Array();

    /**这个其实是一个update操作*/
    this.put = function (key, value) {
        if (key == null || key == undefined) {
            return;
        }
        var index = this._getIndex(key);
        //如果没找到，直接插入
        if (index == -1) {
            //new一个键值对出来，然后放进数组里
            var entry = new Object();
            entry.key = key;
            entry.value = value;
            this._entrys[this._entrys.length] = entry;
        } else {
            //找到了就直接更新这个key对应的value
            this._entrys[index].value = value;
        }
    };
    // 根据key获取value
    this.get = function (key) {
        var index = this._getIndex(key);
        return (index != -1) ? this._entrys[index].value : null;
    };
    // 移除key‐value
    this.remove = function (key) {
        var index = this._getIndex(key);
        if (index != -1) {
            this._entrys.splice(index, 1);
        }
    };
    // 清空map
    this.clear = function () {
        this._entrys.length = 0;
    };
    // 判断是否包含key
    this.contains = function (key) {
        var index = this._getIndex(key);
        return (index != -1) ? true : false;
    };
    // map内key‐value的数量
    this.size = function () {
        return this._entrys.length;
    };
    /**获取所有的key-value */
    this.getEntrys = function () {
        return this._entrys;
    };
    // 获取key对应底层数组的角标
    this._getIndex = function (key) {
        if (key == null || key == undefined) {
            return -1;
        }
        var _length = this._entrys.length;
        for (var i = 0; i < _length; i++) {
            var entry = this._entrys[i];
            if (entry == null || entry == undefined) {
                continue;
            }
            if (entry.key === key) {// equal
                return i;
            }
        }
        //  console.log("没找到哦, 可能是key不对。");
        return -1;
    };
}

var roomTableMap = new myRTCMap();

function Client(uid, conn, roomId) {
    /**用户所属的id*/
    this.uid = uid;
    this.roomId = roomId;
    /** uid 对应的websocket连接*/
    this.conn = conn;
}

/**
 * 
 * @param {} message 
 * @param {WebSocket} conn 这个应该是新加入的用户和服务器的conn
 * @returns 
 */
function handleJoin(message, conn) {
    var roomId = message.roomId;
    /**新加入用户的id */
    var uid = message.uid;

    console.log("uid: " + uid + " try to join room " + roomId);

    /**房间Map，由不多于两个的用户Map构成 */
    var roomMap = roomTableMap.get(roomId);

    if (roomMap == null) {
        roomMap = new myRTCMap();
        roomTableMap.put(roomId, roomMap);
    }

    if (roomMap.size() >= 2) {
        console.error("roomId" + roomId + "已经有两人使用啦,请使用其他房间");
        //加信令通知客户端房间已满
        return null;
    }

    var client = new Client(uid, conn, roomId);
    roomMap.put(uid, client);

    //房间里面有人了，加上新进来的人，那就是大于1了，这时候房间满了。
    if (roomMap.size() > 1) {
        /**在房间里的用户表, 大小为2, 每个元素是一个用户Map */
        var clients = roomMap.getEntrys();
        for (var i in clients) {
            var remoteUid = clients[i].key;
            //在房间里的用户的id
            if (remoteUid != uid) {
                /**创建一个JSON对象 */
                var jsonMsg = {
                    'cmd': SIGNAL_TYPE_NEW_PEER,
                    'remoteUid': uid
                };
                /**转换后的JSON字符串，可以通过WebSocket发送*/
                var msg = JSON.stringify(jsonMsg);
                var remoteClient = roomMap.get(remoteUid);
                console.info("new-peer :" + msg);
                remoteClient.conn.sendText(msg);

                jsonMsg = {
                    'cmd': SIGNAL_TYPE_RESP_JOIN,
                    'remoteUid': remoteUid
                }
                msg = JSON.stringify(jsonMsg);
                console.info("response-join: " + msg);
                conn.sendText(msg);
            }
        }
    }
    return client;
}

function handleLeave(message) {
    var uid = message.uid;
    var roomId = message.roomId;
    console.log("uid: " + uid + "try to leave room " + roomId);
    var roomMap = roomTableMap.get(roomId);
    if (roomMap == null) {
        console.error("handleLeave can not find the roomId: " + roomId);
        return;
    }
    //删除要退出的用户 
    roomMap.remove(uid);
    //通知房间里的其余用户
    if (roomMap.size() != 0) {
        var clients = roomMap.getEntrys();
        for (var i in clients) {
            var remoteUid = clients[i].key;
            var jsonMsg = {
                'cmd': SIGNAL_TYPE_PEER_LEAVE,
                'remoteUid': uid
            };
            var msg = JSON.stringify(jsonMsg);
            var remoteClient = roomMap.get(remoteUid);
            if (remoteClient) {
                console.info("notify peer, which uid is " + remoteUid + " that uid: " + uid + " has leave the room.");
                remoteClient.conn.sendText(msg);
            }
        }
    }
}

function handleAnswer(message) {
    var uid = message.uid;
    var roomId = message.roomId;
    var remoteUid = message.remoteUid;

    console.log("handleAnswer uid: " + uid + "transfer answer-message to the remoteUid: " + remoteUid);
    var roomMap = roomTableMap.get(roomId);
    if (roomMap == null) {
        console.error("handleAnswer can not find the roomId: " + roomId);
        return;
    }

    if (roomMap.get(uid) == null) {
        console.error("handleAnswer can not find the uid: " + uid);
        return;
    }

    var remoteClient = roomMap.get(remoteUid);
    if (remoteClient) {
        var msg = JSON.stringify(message);
        console.info("send the answer-message sent by uid: " + uid + " to remoteUid: " + remoteUid);
        remoteClient.conn.sendText(msg);
    }
    else {
        console.error("can not find the remote client in the room, which remoteUid is: " + remoteUid);
    }
}

function handleOffer(message) {
    var uid = message.uid;
    var roomId = message.roomId;
    var remoteUid = message.remoteUid;

    console.log("handleOffer uid: " + uid + "transfer offer-message to the remoteUid: " + remoteUid);
    var roomMap = roomTableMap.get(roomId);
    if (roomMap == null) {
        console.error("handleOffer can not find the roomId: " + roomId);
        return;
    }

    if (roomMap.get(uid) == null) {
        console.error("handleOffer can not find the uid: " + uid);
        return;
    }

    var remoteClient = roomMap.get(remoteUid);
    if (remoteClient) {
        var msg = JSON.stringify(message);
        console.info("send the offer-message sent by uid: " + uid + " to remoteUid: " + remoteUid);
        remoteClient.conn.sendText(msg);
    }
    else {
        console.error("can not find the remote client in the room,which remoteUid is: " + remoteUid);
    }
}


function handleCandidate(message) {
    var uid = message.uid;
    var roomId = message.roomId;
    var remoteUid = message.remoteUid;

    console.log("handleAnswer uid: " + uid + "transfer answer-message to the remoteUid: " + remoteUid);
    var roomMap = roomTableMap.get(roomId);
    if (roomMap == null) {
        console.error("handleAnswer can not find the roomId: " + roomId);
        return;
    }

    if (roomMap.get(uid) == null) {
        console.error("handleAnswer can not find the uid: " + uid);
        return;
    }

    var remoteClient = roomMap.get(remoteUid);
    if (remoteClient) {
        var msg = JSON.stringify(message);
        console.info("send the answer-message sent by uid: " + uid + " to remoteUid: " + remoteUid);
        remoteClient.conn.sendText(msg);
    }
    else {
        console.error("can not find the remote client in the room, which remoteUid is: " + remoteUid);
    }
}

/**其实就是一步检查程序，如果没正确退出，则重新删除一遍 */
function handleForceLeave(client) {
    var uid = client.uid;
    var roomId = client.roomId;

    var roomMap = roomTableMap.get(roomId);
    if (roomMap == null) {
        console.error("handleLeave can not find the roomId: " + roomId);
        return;
    }
    //判别是否在房间内
    if (!roomMap.contains(uid)) {
        console.info("uid: " + uid + "has leave room " + roomId);
        return;
    }
    //走到这一步，说明客户端没有正确离开，所以我们要执行离开程序
    console.log("uid: " + uid + "force leave room " + roomId);
    //删除要退出的用户 
    roomMap.remove(uid);
    //通知房间里的其余用户
    if (roomMap.size() != 0) {
        var clients = roomMap.getEntrys();
        for (var i in clients) {
            var remoteUid = clients[i].key;
            var jsonMsg = {
                'cmd': SIGNAL_TYPE_PEER_LEAVE,
                'remoteUid': uid
            };
            var msg = JSON.stringify(jsonMsg);
            var remoteClient = roomMap.get(remoteUid);
            if (remoteClient) {
                console.info("notify peer, which uid is " + remoteUid + " that uid: " + uid + " has leave the room.");
                remoteClient.conn.sendText(msg);
            }
        }
    }

}
/** 创建一个连接*/
var server = ws.createServer(function (conn) {
    console.log("创建一个新的连接‐‐‐‐‐‐‐‐");
    conn.client = null;
    // var recvMsg = JSON.stringify("The server has received your connection request!");
    //console.log(recvMsg);
    //  conn.sendText(recvMsg);

    user++;
    conn.nickname = "user" + user;
    conn.fd = "user" + user;
    var mes = {};
    mes.type = "enter";
    mes.data = conn.nickname + " 进来啦";
    broadcast(JSON.stringify(mes)); // 广播

    //向客户端推送消息
    conn.on("text", function (str) {
        //   console.log("回复 " + str)
        var jsonMsg = JSON.parse(str);
        switch (jsonMsg.cmd) {
            case SIGNAL_TYPE_JOIN:
                conn.clinet = handleJoin(jsonMsg, conn);
                break;
            case SIGNAL_TYPE_LEAVE:
                handleLeave(jsonMsg);
                break;
            case SIGNAL_TYPE_OFFER:
                handleOffer(jsonMsg);
                break;
            case SIGNAL_TYPE_ANSWER:
                handleAnswer(jsonMsg);
                break;
            case SIGNAL_TYPE_CANDIDATE:
                handleCandidate(jsonMsg);
                break;
        }

        mes.type = "message";
        mes.data = conn.nickname + " 发送: " + str;
        broadcast(JSON.stringify(mes));
    });

    //监听关闭连接操作
    conn.on("close", function (code, reason) {
        console.log("关闭连接 code: " + code + " ,reason: " + reason);
        mes.type = "leave";
        mes.data = conn.nickname + " 离开了"
        broadcast(JSON.stringify(mes));
        if (conn.client != null) {
            //强制退出
            handleForceLeave(conn.client);
        }
    });

    //错误处理
    conn.on("error", function (err) {
        console.log("监听到错误");
        console.log(err);
    });
}).listen(port);

function broadcast(str) {
    server.connections.forEach(function (connection) {
        connection.sendText(str);
    })
}