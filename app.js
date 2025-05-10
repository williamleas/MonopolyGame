const express = require("express")
const app = express();
const serv = require("http").Server(app)

app.get("/",function(req,res) {
    res.sendFile(__dirname + "/client/index.html");
});

app.get("/lobby-page",function(req,res) {
    res.sendFile(__dirname + "/client/lobby-page.html")
});

app.get("/join-page",function(req,res) {
    res.sendFile(__dirname + "/client/join-page.html")
});

app.use("/client",express.static(__dirname + "/client"));

function objectDefined(value) {
  for (let prop in value) {
    if (value.hasOwnProperty(prop)) return true;
  }
  return false;
}

function findRoomCodeByPlayerId(rooms, playerId) {
    for (const roomCode in rooms) {
        const room = rooms[roomCode];
        
        // Check if player is host
        if (room.host && room.host.id === playerId) {
            return roomCode;
        }
        
        // Check if player is in guests
        if (room.guests.some(guest => guest.id === playerId)) {
            return roomCode;
        }
        
        // Check if player is in playerData
        if (room.playerData.some(player => player.id === playerId)) {
            return roomCode;
        }
    }
    
    return null; // Player not found in any room
}

function removePlayerById(rooms, roomCode, objectId) {
    // If roomCode is not provided, or it's actually the player ID (function called with 2 args)
    if (!roomCode || (arguments.length === 2 && typeof roomCode === 'string')) {
        // If only 2 arguments were provided (rooms and playerId)
        if (arguments.length === 2) {
            objectId = roomCode;
            roomCode = null;
        }
        
        // Find which room contains this player
        if (!roomCode) {
            roomCode = findRoomCodeByPlayerId(rooms, objectId);
            if (!roomCode) {
                console.warn(`Player with ID ${objectId} not found in any room`);
                return { player: null, roomCode: null };
            }
        }
    }

    // Check if the room exists
    if (!rooms[roomCode]) {
        console.warn(`Room ${roomCode} does not exist`);
        return { player: null, roomCode };
    }

    const room = rooms[roomCode];
    let removedPlayer = null;

    // Check if the player is the host
    if (room.host && room.host.id === objectId) {
        removedPlayer = room.host;
        if (room.guests.length > 0) {
            room.host.id = room.guests[0].id
            room.host.name = room.guests[0].name
            room.guests.splice(0,1)
            console.log(`Host removed from room ${roomCode} new host id: ${room.host.id} new host name: ${room.host.name}`)
        } else {
            room.host = null
            console.log(`Host removed from room ${roomCode}`)
        }
        
    } 
    // Check if the player is in the guests array
    else {
        const guestIndex = room.guests.findIndex(guest => guest.id === objectId);
        if (guestIndex !== -1) {
            removedPlayer = room.guests.splice(guestIndex, 1)[0];
            console.log(`Guest removed from room ${roomCode}`);
        } 
        // Check if the player is in the playerData array
        else {
            const playerDataIndex = room.playerData.findIndex(player => player.id === objectId);
            if (playerDataIndex !== -1) {
                removedPlayer = room.playerData.splice(playerDataIndex, 1)[0];
                console.log(`Player removed from playerData in room ${roomCode}`);
            } else {
                console.warn(`Player with ID ${objectId} not found in room ${roomCode}`);
            }
        }
    }

    return { player: removedPlayer, roomCode: roomCode };
}


function generateUniqueCode(existingCodes) {
  // Keep generating codes until we find a unique one
  while (true) {
    // Generate a random number between 0 and 999999
    let code = Math.floor(Math.random() * 1000000);
    
    // Pad with leading zeros if needed to ensure 6 digits
    code = code.toString().padStart(6, '0');
    
    // Check if this code is unique (not in our existing codes)
    if (!existingCodes || !existingCodes.includes(code)) {
      return code;
    }
  }
}

function formatParticipants(roomData) {
    var participants = []

    if (roomData.host != null){
        host = roomData.host
        host["isHost"] = true
        participants.push(host)

        guests = roomData.guests

        if (guests.length != 0) {
            for (let key in guests) {
                guests[key]["isHost"] = false
                participants.push(guests[key])
            }
        }
        return participants
    } else {
        return null
    }
}


var rooms = {}

const io = require("socket.io") (serv,{});
io.on("connection", function(socket){
    console.log("socket connection")
    // needs formatting to work with new socket method
    

    socket.on("create-room",function() {
        var roomCode = generateUniqueCode(rooms.keys)

        rooms[roomCode] = {
            host: {
                id: socket.id,
                name: "Host",
                ready: "Not Ready"
            },
            guests: [],
            playerData: []
        };

        socket.join(roomCode);

        socket.emit("room-created",{
            roomcode: roomCode,
            participants: [{ id: socket.id, name: rooms[roomCode].host.name, ready: rooms[roomCode].host.ready, isHost: true}]
        });

        console.log(`Room created: ${roomCode} by ${socket.id}`);

    });

    socket.on("join-room",function(data) {

        var roomCode = data.code;

        if (roomCode in rooms) {
            
            participants = formatParticipants(rooms[roomCode])
            if (participants.length >= 4) {
                socket.emit("room-full");

            } else {
                rooms[roomCode].guests.push({id: socket.id,ready:"Not Ready",name:`Player ${rooms[roomCode].guests.length + 1}`})
                
                console.log(rooms[roomCode].guests[0])

                io.to(roomCode).emit("participants-update",{
                    participants:participants
                });

                socket.join(roomCode);
                
                socket.emit("room-joined",{
                    participants: participants,
                    roomCode: roomCode
                });
            };
     
        } else {
            socket.emit("room-404")
        }

    });

    //formatted correctly

    socket.on("reconnect",function(data){
        var found = false
        if (rooms[data.roomCode] === undefined || rooms[data.roomCode].host === null) {
            socket.emit("room-404")
        } else {
            if (rooms[data.roomCode].guests === undefined || rooms[data.roomCode].guests.length == 0) {
                console.log("Guests not found")
            } else {
                console.log(rooms[data.roomCode].guests.length)
                for (let key in rooms[data.roomCode].guests) {
                    console.log(rooms[data.roomCode].guests[key].id)
                    if (rooms[data.roomCode].guests[key].id == data.oldId) {
                        rooms[data.roomCode].guests[key].id = socket.id
                        found = true
                        break
                    }
            }
            }
            

            if (data.oldId == rooms[data.roomCode].host.id && !found) {
                rooms[data.roomCode].host.id = socket.id
            } else if (!found) {
                console.log("error")
            }

            participants = formatParticipants(rooms[data.roomCode])
            console.log(participants)
            socket.join(data.roomCode)

            io.to(data.roomCode).emit("participants-update",{
                participants:participants
            })
        }
        


        
    })

    socket.on("name-changed",function(data) {
        if (rooms[data.roomCode] === undefined) {
            socket.emit("room-404")
        }else{
            var oldName = ""
            if (socket.id == rooms[data.roomCode].host.id) {
                oldName = rooms[data.roomCode].host.name
                rooms[data.roomCode].host.name = data.newName

            } else {
                for (let key in rooms[data.roomCode].guests) {
                    if (rooms[data.roomCode].guests[key].id == socket.id) {
                        oldName = rooms[data.roomCode].guests[key].name
                        rooms[data.roomCode].guests[key].name = data.newName
                        break
                    } 
                }
            }

            participants = formatParticipants(rooms[data.roomCode])
            if (oldName != data.newName) {
                io.to(data.roomCode).emit("participants-update",{
                    participants:participants
                })
            }
            
        }
    })

    socket.on("start-game",function(data) {
        socket.emit("game-started")
        setTimeout(function(){
            io.to(data.roomCode).emit("game-started")
        }, 2000)
    })
    
    socket.on("disconnect",function(data) {
        setTimeout(function() {
            const roomCode = findRoomCodeByPlayerId(rooms,socket.id)
            if (roomCode) {
                removePlayerById(rooms,roomCode,socket.id)

                var participants = formatParticipants(rooms[roomCode])

                io.to(roomCode).emit("participants-update",{
                    participants: participants
                })
            }
        },4000)  
    })

    socket.on("readyStatus-update",function(data) {
        if (data.playerStatus == "Not Ready") {
            var newStatus = "Ready"
        } else if(data.playerStatus == "Ready") {
            var newStatus = "Not Ready"
        }

        if (socket.id == rooms[data.roomCode].host.id) {
            rooms[data.roomCode].host.ready = newStatus
            console.log(rooms[data.roomCode].host.ready)
        } else {
            for (let key in rooms[data.roomCode].guests) {
                if (rooms[data.roomCode].guests[key].id == socket.id) {
                    rooms[data.roomCode].guests[key].ready = newStatus
                    console.log(rooms[data.roomCode].guests[key].ready)
                    break
                } 
            }
        }
        

        io.to(data.roomCode).emit("readyStatus-updated",{
            playerId: socket.id,
            newStatus: newStatus
        })
    })
});




serv.listen(2000);
console.log("Server started.");