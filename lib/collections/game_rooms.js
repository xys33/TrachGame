GameRooms = new Meteor.Collection('gameRooms')
Messages=new Meteor.Collection('messages')


removeJoinAuth = function(userId, username, roomId) {
    //get rid of their currentGameRoom property
    Meteor.users.update({_id: userId}, {
        $set: {
            'profile.currentGameRoom': false,
            'profile.leftAt': false
        }
    });

    //remove them from the room's player list
    var gameRoom = GameRooms.findOne(roomId);
    if (!gameRoom) {
        return; //no room to remove them from
    }
    var idxInPlayers = false;
    if (!gameRoom.open) {
        idxInPlayers = gameRoom.players.reduce(
            function(ret, player, idx) {
                return gameRoom.turn === player._id ? idx : ret;
            }, false
        );
    } //for the purposes of seeing whose turn it is
    GameRooms.update({_id: roomId}, {
        $pullAll: {
            players: [{
                _id: userId,
                username: username
            }]
        }
    });

    //check to see if the room is then empty
    gameRoom = GameRooms.findOne({_id: roomId}); //updated
    var players = gameRoom.players;
    if (players.length === 0) {
        //their leaving the room made it empty
        GameRooms.remove({_id: roomId}); //so delete the room
    } else {
        //not empty so choose a new owner
        var newOwner = players[0];
        var updateObj = {
            userId: newOwner._id,
            author: newOwner.username
        };
    }
};

endGame = function(roomId) {
    var updatedRoom = GameRooms.findOne(roomId);
    var playerIds = updatedRoom.players.map(function(player) {
        return player._id;
    });
    var playerLives = playerIds.map(function(playerId) {
        return [playerId, updatedRoom.playerLives[playerId]]
    });
    var lastAlive = playerLives.reduce(function(acc, scorePair) { //-----------tu ostatni zywy-> zwyciezca
        return acc[1] > scorePair[1] ? acc : scorePair;
    });
    var winnerName = updatedRoom.players[
        playerIds.indexOf(lastAlive[0])
    ].username;
    GameRooms.update(roomId, {
        $set: {
            winner: {
                username: winnerName,
            },
            turn: false
        }
    });

    return {
        success: true,
        gameOver: true
    };
};

Meteor.methods({
    'addGameRoom': function(gameRoomInfo) {
        check(Meteor.userId(), String);
        check(gameRoomInfo, {
            title: String,
            maxPlayers: Number,
            password: String,
            passwordProtected: Boolean
        });

        var user = Meteor.user();
        var currRoomId = !!user.profile ? user.profile.currentGameRoom : false;
        var leftAt = !!user.profile ? user.profile.leftAt : false;
        if (!!currRoomId || !!leftAt) {
            return {
                alreadyInRoom: true
            };
        }

        gameRoomInfo.maxPlayers = Math.max(
            Math.min(gameRoomInfo.maxPlayers || 1,5), 1
        );
        var gameRoom = _.extend(gameRoomInfo, {
            userId: user._id,
            author: user.username,
            players: [{
                _id: user._id,
                username: user.username
            }],
            open: true,
            createdAt: new Date()
        });

        var gameRoomId = GameRooms.insert(gameRoom);
        Meteor.users.update({_id: Meteor.userId()}, {
            $set: {
                'profile.currentGameRoom': gameRoomId,
                'profile.leftAt': false
            }
        });

        return {
            _id: gameRoomId
        }
    },

    'deleteGameRoom': function(roomId) {
        check(roomId, String);
        check(Meteor.userId(), String);

        var room = GameRooms.findOne(roomId);
        if (isRoomOwner(room)) {
            var players = room.players || [];
            players.map(function(player) {
                Meteor.users.update({_id: player._id}, {
                    $set: {
                        'profile.currentGameRoom': false,
                        'profile.leftAt': false
                    }
                });
            });
            GameRooms.remove(roomId);

            return {
                success: true
            };
        } else {
            return {
                notRoomOwner: true
            };
        }
    },

    'joinGameRoom': function(roomId, password) {
        check(roomId, String);
        check(password, String);

        var user = Meteor.user();
        if (!user) {
            return {
                notLoggedOn: true
            };
        }

        var currRoomId = !!user.profile ? user.profile.currentGameRoom : false;
        var leftAt = !!user.profile ? user.profile.leftAt : false;
        if (!!currRoomId || !!leftAt) {
            return {
                alreadyInRoom: true
            };
        } else {
            var gameRoom = GameRooms.findOne({_id: roomId});
            if (gameRoom.players.length >= gameRoom.maxPlayers) {
                return {
                    isAtCapacity: true
                };
            } else if (!gameRoom.open) {
                return {
                    alreadyStarted: true
                }
            } else if (password !== gameRoom.password) {
                return {
                    wrongPassword: true
                };
            } else {
                //not at capacity, not already in a room, correct password
                //so they're good to go!
                GameRooms.update({_id: roomId}, {
                    $addToSet: {
                        players: {
                            _id: Meteor.userId(),
                            username: Meteor.user().username
                        }
                    }
                });

                Meteor.users.update({_id: Meteor.userId()}, {
                    $set: {
                        'profile.currentGameRoom': roomId,
                        'profile.leftAt': false
                    }
                });

                return {
                    success: true
                }
            }
        }
    },

    'leaveRoom': function() {
        var user = Meteor.user();
        if (!user) return;

        var currRoomId = !!user.profile ? user.profile.currentGameRoom : false;
        var leftAt = !!user.profile ? user.profile.leftAt : false;
        if (!!leftAt) return; //already left; don't do anything
        var numRooms = GameRooms.find(currRoomId).count();
        if (numRooms > 0) { //they're leaving an actual room
            Meteor.users.update({_id: Meteor.userId()}, {
                $set: {
                    'profile.currentGameRoom': false,
                    'profile.leftAt': +new Date()
                }
            });
        } else { //the room they're leaving doesn't exist
            Meteor.users.update({_id: Meteor.userId()}, {
                $set: {
                    'profile.currentGameRoom': false,
                    'profile.leftAt': false
                }
            });
        }
    },

    'removeJoinAuth': function() {
        var user = Meteor.user();
        if (!user) {
            return {
                notLoggedOn: true
            };
        };

        var currRoomId = !!user.profile ? user.profile.currentGameRoom : false;
        if (!currRoomId) {
            return {
                notInRoom: true
            };
        }

        removeJoinAuth(Meteor.userId(), user.username, currRoomId);

        return {
            success: true
        };
    },

    'insertMessage': function(name,value){

        check(name,String);
        check(value,String);

        Messages.insert({
              name: name,
              message: value,
              time: Date.now(),
            });
      },

    'offensive': function(roomId,init,targ,t){

        check(roomId, String);
        check(init, String);
        check(targ, String);
        check(t, String);

        var actionInProgress = [];
        actionInProgress.push({ //------------------------------dane nowej akcji
                _id: Random.id(),
                active: true,
                initiator: init,
                target: targ,
                type: t,
                enhance_flag: false
            });
        GameRooms.update(roomId, { //------------------------------aktualizacja atakow w grze
                $pushAll: {
                    actionsInProgress: actionInProgress//aktywne akcje
                }});
         },

    'forward': function(roomId,sAction,init,targ){
        check(roomId,String);
        check(sAction,String);
        check(init,String);
        checkt(targ,String);

        GameRooms.actionInProgress.update(
            {_id: sAction},
            {$set: {initiator: init, target: targ}},
            { upsert: true }
            );

    },
    'reflect': function(roomId,sAction){
        check(roomId,String);
        check(sAction,String);

        var init = GameRooms.actionsInProgress.findOne(sAction, {
            fields: {
                target: 1
            }});
        var targ = GameRooms.actionsInProgress.findOne(sAction, {
            fields: {
                initiator: 1
            }});
       GameRooms.actionInProgress.update(
            {_id: sAction},
            {$set: {initiator: init, target: targ}},
            { upsert: true }
            );

    },

    'nuclearButton': function(roomId){
        check(roomId,String);
        var players = GameRooms.findOne(roomId,{fields: {players: 1}});

        for(var i=0;i<rawData.players.count();i++){

        GameRooms.findOne(roomId).playerScores.update( //----------------todo: kontrola flagi nuclearBunker
            { _id: players[i]._id}, 
            {$inc: {scores: -1}}
            );
        }
    },

    'nuclearBunker': function(roomId,targ){
        check(roomId,String);
        check(targ,String);

        GameRooms.findOne(roomId).playersFlags.update(
            { _id: targ},
            {$set: {nuclearBunker: true}}
        );

    },

    'freeze': function(roomId,targ){
        check(roomId,String);
        check(targ,String);

        GameRooms.findOne(roomId).playersFlags.update( //---------to pewnie tez popsute
            { _id: targ},
            {$set: {freeze: true}}
        );
    },

    'resurrection': function(roomId,targ){
        check(roomId,String);
        check(targ,String);

        GameRooms.findOne(roomId).playerScores.update( //-----------------popsute
            {_id: targ},
            {$set: {scores: 5}}
        );
    },

    'cure': function(roomId,targ){ //---------------------------popsute
        check(roomId,String);
        check(targ,String);

        GameRooms.findOne(roomId).playerScores.update(
            {_id: targ},
            {$inc: {scores: 1}}
        );
    },

    'globalization': function(roomId,sAction,targets){
        check(roomId,String);
        check(sAction,String);

        var sel_action = GameRooms.findOne(roomId).actionsInProgress.findOne(sAction);
        init  = sel_action.initiator;
        type = sel_action.type;
        var actionInProgress = [];

        for(var i=0;i<targets.count();i++){
        actionInProgress.push({ //------------------------------dane nowej akcji
                _id: Random.id(),
                active: true,
                initiator: init,
                target: targets[i]._id,
                type: type
            });
        GameRooms.update(roomId, { //------------------------------aktualizacja akcji
                $pushAll: {
                    actionsInProgress: actionInProgress//aktywne akcje
                }});
         }



    },

    'startGame': function(roomId) {
        check(roomId, String);

        var gameRoom = GameRooms.findOne(roomId);
        if (gameRoom.userId === Meteor.userId()) {

            //the bag of letters all games start with
            var letterBag = {
                'Offensive': 15,
                'Defence' : 5,
                'Forward' : 5,
                'Cure' : 5,
                'Reflect': 5,
                'HollowBrick': 5,
                'MassiveAttack': 5,
                'Enhance': 5,
                'Freeze': 5,
                'NuclearButton': 2,
                'NuclearBunker': 5,
                'Globalization': 2,
                'Resurrection' : 1
            };

            //get everyone's initial racks
            var cardsPerHand = 5;
            var playerRacks = {};
            var playerScores = {};
            var passedLastTurn = {};
            var actionsInProgress =[];
            var playersFlags = {};

            for (var pi = 0; pi < gameRoom.players.length; pi++) {
                var rack = [];
                for (var ai = 0; ai < cardsPerHand; ai++) {
                    var handCard = getRandKeyFromCountSet(letterBag);
                    rack.push({
                        _id: ai,
                        letter: handCard,
                    });
                }

                playerRacks[gameRoom.players[pi]._id] = rack;
                playerScores[gameRoom.players[pi]._id] = 5; //-------------------5 zyc dla gracza
                passedLastTurn[gameRoom.players[pi]._id] = false;
                playersFlags[gameRoom.players[pi]._id] = {
                                                            nucleraBunker: false,
                                                            freeze: false
                                                          };

            }

            //then they're the owner
            GameRooms.update(roomId, {
                $set: {
                    open: false,
                    letterBag: letterBag,
                    playerRacks: playerRacks,
                    playerScores: playerScores,
                    tiles: false,
                    turn: gameRoom.userId, //owner goes first
                    winner: false,
                    passedLastTurn: passedLastTurn,
                    actionsInProgress: actionsInProgress,//aktywne akcje
                    playersFlags: playersFlags
                }
            });

            return {
                success: true
            };
        } else {
            return {
                notRoomOwner: true
            };
        }
    },

    'makeMove': function(roomId, tilePlacements) {
        check(roomId, String);

        //find out if they're even in this room
        var gameRoom = GameRooms.findOne(roomId);
        var playerIds = GameRooms.findOne({_id: roomId}, {
            fields: {players: 1}
        }).players.map(function(player) {
            return player._id;
        });

        //make sure they're in this room
        if (playerIds.indexOf(Meteor.userId()) === -1) {
            return {
                notInRoom: true
            };
        }

        //make sure the game isn't over
        if (!!gameRoom.winner) {
            return {
                gameOver: true
            };
        }

        //make sure it's their turn
        if (gameRoom.turn !== Meteor.userId()) {
            return {
                notTheirTurn: true
            }
        }


        //advance the turn to the next player
        var idxInPlayers = gameRoom.players.reduce(function(ret, player, idx) {
            return gameRoom.turn === player._id ? idx : ret;
        }, false);
        var idxNextPlayer = (idxInPlayers+1)%gameRoom.players.length;
        var nextTurn = gameRoom.players[idxNextPlayer]._id;
    }

});

function getRandKeyFromCountSet(countSet) {
    var keys = Object.keys(countSet);
    if (keys.length === 0) return false;
    else {
        var letters = [];
        for (var ki = 0; ki < keys.length; ki++) {
            for (var li = 0; li < countSet[keys[ki]]; li++) {
                letters.push(keys[ki]);
            }
        }
        var letter = letters[Math.floor(letters.length * Math.random())];
        if (countSet[letter] === 1) {
            delete countSet[letter];
        } else {
            countSet[letter] -= 1;
        }
        return letter;
    }
}