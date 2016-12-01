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


        GameRooms.actionInProgress.update( //--------------------------------------------------------------chyba zle
            {_id: sAction},
            {$set: {initiator: init, target: targ}},
            { upsert: true }
            );

    },
    
    'reflect': function(roomId,sAction){
        check(roomId,String);
        check(sAction,String);

        var init = GameRooms.actionsInProgress.findOne(sAction, { //-------------------------------chyba tak samo zle
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
        var playersFlags = GameRooms.findOne(roomId,{fields: {playersFlags: 1}});

            for(var i=0;i<players.length;i++){
              
                if(playersFlags[players[i]._id].nuclearBunker == false) //sprawdzenie czy ma schron
                GameRooms.findOne(roomId).playerScores.update( //---------------- flaga NuclearBunker
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

    'cure': function(roomId,targ,t){ //---------------------------popsute
        check(roomId,String);
        check(targ,String);
        check(t,String);

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
            var stillActive = {};

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
                stillActive[gameRoom.players[pi]._id] = true;
                playersFlags[gameRoom.players[pi]._id] = {
                                                            nuclearBunker: false,
                                                            freeze: false,
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
                    move: gameRoom.userId, // owner do first move
                    winner: false,
                    passedLastTurn: passedLastTurn,
                    actionsInProgress: actionsInProgress,//aktywne akcje
                    playersFlags: playersFlags,
                    stillActive: stillActive //gracze aktywni w ruchu
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

    'makeRound': function(roomId) {
        check(roomId, String);

        //find out if they're even in this room
        var gameRoom = GameRooms.findOne(roomId);
        var playerIds = GameRooms.findOne({_id: roomId}, {
            fields: {players: 1}
        }).players.map(function(player) {
            return player._id;
        });
        var playerLives = GameRooms.findOne({_id: roomId},{fields: {playerScores: 1}});

        //check 
        for(var i=0; i<playersLives.length; i++)
        {

        }

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


    },

    'makeMove': function(roomId,playerId){
        check(roomId,String);
        check(playerId,String);


        var init = playerId;
        var targ = Session.get('selected-enemy');
        var sAction = Session.get('selected-action'); 
        var type = Session.get('selected-card');     


        switch(type){

            case "Offensive":{ //atak
                     if(targ !=0){ //-----------------------------------------------wybrany cel

                        Meteor.call('offensive', roomId, init, targ, type, function(err, result) {
                            if (err) return Errors.throw(err.reason);
                        });
                     }
            console.log(type);
            } break;

            case "Defence":{

            console.log(type);
            } break;

            case "Forward":{ //przerzut

                if(targ !=0 && sAction !=0){
                    Meteor.call('forward',roomId,sAction,init,targ, function(err, result) {
                            if (err) return Errors.throw(err.reason);
                        });
                }
            console.log(type);    
            } break;

            case "Cure":{ //uzdrowienie
                if(targ == false)
                    targ = init;

                Meteor.call('cure',roomId,targ,type,function(err, result) {
                            if (err) return Errors.throw(err.reason);
                        });
            console.log(type);
            } break;

            case "Reflect":{ //odbicie

                var check_target = GameRooms.actionsInProgress.findOne(sAction, {
            fields: {
                target: 1
            }});
                if(check_target == init)
                {
                    Meteor.call('reflect',roomId,sAction, function(err, result) {
                            if (err) return Errors.throw(err.reason);               
                 });
                }
            console.log(type);
            } break;

            case "HollowBrick":{ //pustak
                console.log("brawo uzyles pustaka! dzieje sie... nic");
            } break;

            case "MassiveAttack":{ //zmasowany atak
                var enemies = enemiesListGen();
                var count = enemies.length;
                for(var i=0;i<count;i++)
                {
                    targ = enemies[i]._id;
                    Meteor.call('offensive', roomId, init, targ, type, function(err, result) {
                            if (err) return Errors.throw(err.reason);
                        });
                }
            console.log(type);
            } break;

            case "Enhance":{ //wzmocnienie--------------------------------------------------------------


            console.log(type);
            } break;

            case "Freeze":{ //zamrozenie 
                if(targ == false)
                    targ = init;

                Meteor.call('freeze',roomId,targ,function(err, result) {
                            if (err) return Errors.throw(err.reason);
                        });
            console.log(type);
            } break;

            case "NuclearButton":{ //guzik atomow
                Meteor.call('nuclearButton',roomId,function(err, result) {
                            if (err) return Errors.throw(err.reason);
                        });
            console.log(type);
            } break;

            case "NucleraBunker":{ //schron
                if(targ == false)
                    targ = init;

                Meteor.call('nuclearBunker',roomId,targ,function(err, result) {
                            if (err) return Errors.throw(err.reason);
                        });
            console.log(type);
            } break;

            case "Globalization":{ //globalizacja--------------------------------------------------------
                if(sAction == false)
                {
                    Session.set('globalization-flag',true);
                }
                else
                {
                    var targets = GameRoom.findOne(roomId,{fields: {players: 1}});
                    Meteor.call('globalization',roomId,sAction,targets,function(err, result) {
                            if (err) return Errors.throw(err.reason);
                        });
                }
            console.log(type);
            } break;

            case "Resurrection":{ //wskrzeszenie
                if(targ == false)
                    targ = init;

                Meteor.call('resurrection',roomId,targ,function(err, result) {
                            if (err) return Errors.throw(err.reason);
                        });
            console.log(type);
            } break;

        }

        //check if there is  anybody active

        var rawData = GameRooms.findOne({_id: roomId},{
            fields: {   stillActive: 1, 
                        players: 1}});

        var numberOfActive =0;
        for(var i=0;i<activePlayers.length;i++)
        {
            if(rawData.stillActive[rawData.players[i]._id] == ture)
                numberOfActive++;
        }

        if(numberOfActive > 1) //wiecej niz jeden aktywny, przekazanie ruchu
        {   
            var first = true;
        while(rawData.stillActive[nextMove] != true || first)
        {
                  var idxInPlayers = gameRoom.players.reduce(function(ret, player, idx) {
                return gameRoom.move === player._id ? idx : ret;
            }, false);
            var idxNextPlayer = (idxInPlayers+1)%gameRoom.players.length;
            var nextMove = gameRoom.players[idxNextPlayer]._id;
            first = false;
        }

        GameRooms.update(roomId, { //------------------------------aktualizacja atakow w grze
                $set: {
                    move: nextMove//aktywne akcje
                }});
        }
        else // brak aktywnych graczy, rozliczenie akcji, przekazanie tury
            settleLives(roomId);    

    },

    'passTurn': function(roomId,playerId,cardToChange)
    {   check(roomId,String);
        check(playerId,String);
        check(cardToChange,String);

        var gameRoom = GameRooms.findOne(roomId);

        if(cardToChange != false)   //opuszczenie ruchu z wymiana losowej karty
        {
             //get a new card for this user
            var letterBag = gameRoom.letterBag;
            var newCard = getRandKeyFromCountSet(letterBag);
            letterBagIsEmpty = letterBagIsEmpty || !newLetter;
            var oldIdx = Math.floor((Math.random() * 4)); //losowa liczba 0-4
            rack[oldIdx].letter = newLetter;
            
        }
        
        GameRooms.findOne(roomId).playerScores.update( //---------------- strata 1 zycia za opuszczenie kolejki
                { _id: playerId}, 
                {$inc: {scores: -1}}
                );

    },

    'passMove': function(roomId,playerId)
    {
        check(roomId,String);
        check(playerId,String);

        GameRooms.findOne({_id:roomId}).stillActive.update(
            {$set: {playerId: false}}
            );

    },

});

function settleLives(roomId){   //rozliczanie akcji i przekazanie tury

    var rawData = GameRooms.findOne({_id: roomId},{
        fields: {   actionsInProgress: 1,
                    playerScores: 1
                }});
    var type;
    for(var i=0; i<rawData.actionsInProgress.length; i++)
    {   
        type = rawData.actionsInProgress[i].type;
        switch(type){
            case "Cure": 
                {
                    GameRooms.findOne(roomId).playerScores.update( //--------zle
                {_id: rawData.actionsInProgress[i].targ},
                {$inc: {scores: 1}});

                }break;

            case "Offensive":
                 {
                    GameRooms.findOne(roomId).playerScores.update( //--------zle
                {_id: rawData.actionsInProgress[i].targ},
                {$inc: {scores: -1}});

                }break;
        }
         
    }

    //advance the turn to the next player
        var idxInPlayers = gameRoom.players.reduce(function(ret, player, idx) {
            return gameRoom.turn === player._id ? idx : ret;
        }, false);
        var idxNextPlayer = (idxInPlayers+1)%gameRoom.players.length;
        var nextTurn = gameRoom.players[idxNextPlayer]._id;

        GameRooms.update(roomId, { //------------------------------aktualizacja atakow w grze
                $set: {
                    turn: nextTurn//aktywne akcje
                }});
}



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