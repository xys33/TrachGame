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

///////////////////////////////////////////////////////////////////////////
////////////////  dzialanie kart //////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////



    'offensive': function(roomId,init,targ,t){

        check(roomId, String);
        check(init, String);
        check(targ, String);
        check(t, String);

        var actionInProgress = [];
        actionInProgress.push({ //------------------------------dane nowej akcji
                _id: Random.id(),
                initiator: init,
                target: targ,
                type: t,
            });
        GameRooms.update(roomId, { //------------------------------aktualizacja atakow w grze
                $pushAll: {
                    actionsInProgress: actionInProgress//aktywne akcje
                }});
         },

    'nuclearButton': function(roomId){
        check(roomId,String);

        var rawData = GameRooms.findOne({_id: roomId}, {fields: { 
            players: 1,
            playersFlags: 1,
            playerScores: 1,

        }});

        var players = rawData.players;
        var playersFlags = rawData.playersFlags;
        var playerScores = rawData.playerScores;

            for(var i=0;i<players.length;i++){
              
                if(playersFlags[players[i]._id].nuclearBunker == false) //sprawdzenie czy ma schron
                    playerScores[players[i]._id] = playerScores[players[i]._id] - 1; //odebranie zycia
            }

            GameRooms.update(roomId,
            {
                $set:{
                    playerScores: playerScores,
                }
            });
        
    },

    'nuclearBunker': function(roomId,targ){
        check(roomId,String);
        check(targ,String);

        var rawData = GameRooms.findOne({_id: roomId},{fields: {playersFlags: 1}});
        rawData.playersFlags[targ].nuclearBunker = true;

        GameRooms.update(roomId,
        {
            $set: {
                playersFlags: rawData.playersFlags,
            }
        });

    },


    'cure': function(roomId,targ,t){ //---------------------------popsute
        check(roomId,String);
        check(targ,String);
        check(t,String);

         var actionInProgress = [];
        actionInProgress.push({ //------------------------------dane nowej akcji
                _id: Random.id(),
                initiator: init,
                target: targ,
                type: t,
            });
        GameRooms.update(roomId, { //------------------------------aktualizacja atakow w grze
                $pushAll: {
                    actionsInProgress: actionInProgress//aktywne akcje
                }});
    },

    'globalization': function(roomId,sAction,targets){
        check(roomId,String);
        check(sAction,String);

        var rawData = GameRooms.findOne({_id: roomId},{fields: {actionsInProgress: 1}});
        var sel_action;
        for(var i=0; i< rawData.actionsInProgress.count(); i++ )
        {
            if(rawData.actionsInProgress[i]._id == sAction)
                sel_action = rawData.actionsInProgress[i]._id;
        }
        init  = sel_action.initiator;
        type = sel_action.type;

        GameRooms.update(roomId,
        {
            $pull: {
                actionsInProgress: {_id: sAction}
            }
        });

        var actionInProgress = [];
        for(var i=0;i<targets.count();i++){
        actionInProgress.push({ //------------------------------dane nowej akcji
                _id: Random.id(),
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

    'defence': function(roomId,sAction){ //obrona - usuniecie wybranej akcji
        check(roomId,String);
        check(sAction,String);

        GameRooms.update(roomId,
        {
            $pull: {
                actionsInProgress: {_id: sAction}
            }
        });

    },


    'startGame': function(roomId) {
        check(roomId, String);

        var gameRoom = GameRooms.findOne(roomId);
        if (gameRoom.userId === Meteor.userId()) {

            //the bag of letters all games start with
            var letterBag = {
                'Offensive': 15,
                'Defence' : 5,
                'Cure' : 5,
                'HollowBrick': 5,
                'NuclearButton': 2,
                'NuclearBunker': 5,
                'Globalization': 2,
            };

            //get everyone's initial racks
            var cardsPerHand = 5;
            var playerRacks = {};
            var playerScores = {};
            var actionsInProgress =[];
            var playersFlags = {};

            for (var pi = 0; pi < gameRoom.players.length; pi++) {
                var rack = [];
                for (var ai = 0; ai < cardsPerHand; ai++) {

                    //checkLetterBag sprawdzenie czy nie pusta talia
                    var rawData = GameRooms.findOne({_id: roomId},{fields: {letterBag: 1}});
                    var letterBag = rawData.letterBag;
                    if(letterBag.length == 0)
                    {
                        letterBag = {
                                'Offensive': 15,
                                'Defence' : 5,
                                'Cure' : 5,
                                'HollowBrick': 5,
                                'NuclearButton': 2,
                                'NuclearBunker': 5,
                                'Globalization': 2,
                            };

                        GameRooms.update(roomId,
                        {
                            $set:{
                                letterBag: letterBag
                            }
                        });
                    }

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
                                                            nuclearBunker: false,
                                                          };

            }

            //then they're the owner
            GameRooms.update(roomId, {
                $set: {
                    open: false,
                    letterBag: letterBag,
                    playerRacks: playerRacks,
                    playerScores: playerScores,
                    turn: gameRoom.userId, //owner goes first
                    winner: false,
                    actionsInProgress: actionsInProgress,//aktywne akcje
                    playersFlags: playersFlags,
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

    'makeMove': function(roomId,playerId){
        check(roomId,String);
        check(playerId,String);


        var init = playerId;
        var targ = Session.get('selected-enemy');
        var sAction = Session.get('selected-action'); 
        var type = Session.get('selected-card');    
        var cardId = Session.get('selected-card-id'); 

        if(targ != false && sAction != false && type != false)
        {
            // dokonanie akcji
            switch(type){

                case "Offensive":{ //atak
                         if(targ !=0){ //-----------------------------------------------wybrany cel

                            Meteor.call('offensive', roomId, init, targ, type, function(err, result) {
                                if (err) return Errors.throw(err.reason);
                            });
                         }
                } break;

                case "Defence":{

                } break;

                
                case "HollowBrick":{ //pustak
                    console.log("brawo uzyles pustaka! dzieje sie... nic");
                } break;

               
                case "NuclearButton":{ //guzik atomow
                    Meteor.call('nuclearButton',roomId,function(err, result) {
                                if (err) return Errors.throw(err.reason);
                            });
                } break;

                case "NucleraBunker":{ //schron
                    if(targ == false)
                        targ = init;

                    Meteor.call('nuclearBunker',roomId,targ,function(err, result) {
                                if (err) return Errors.throw(err.reason);
                            });
                } break;

                case "Globalization":{ //globalizacja--------------------------------------------------------
                    
                        var targets = GameRoom.findOne(roomId,{fields: {players: 1}});
                        Meteor.call('globalization',roomId,sAction,targets,function(err, result) {
                                if (err) return Errors.throw(err.reason);
                            });
                    
                } break;

                case "Cure":{

                }break;

                default: 
                console.log(type,'niespodzianka!!! cos poszlo nie tak');

            }

            // losowanie nowej karty
            var letterBag = gameRoom.letterBag;
            //checkLetterBag - sprawdzenie czy nie pusta talia
                var rawData = GameRooms.findOne({_id: roomId},{fields: {letterBag: 1}});
                var letterBag = rawData.letterBag;
                if(letterBag.length == 0)
                {
                    letterBag = {
                            'Offensive': 15,
                            'Defence' : 5,
                            'Cure' : 5,
                            'HollowBrick': 5,
                            'NuclearButton': 2,
                            'NuclearBunker': 5,
                            'Globalization': 2,
                        };

                    GameRooms.update(roomId,
                    {
                        $set:{
                            letterBag: letterBag
                        }
                    });
                }
            var newCard = getRandKeyFromCountSet(letterBag);
            rack[cardId].letter = newLetter;

            //rozliczenie akcji wymierzonych w gracza - settleLives
             var rawData = GameRooms.findOne({_id: roomId},{
            fields: {   actionsInProgress: 1,
                        playerScores: 1
                    }});
            var type;
            var target;
            for(var i=0; i<rawData.actionsInProgress.length; i++)
            {   
                target = rawData.actionsInProgress[i].target;
                if(target == playerId)
                {
                        type = rawData.actionsInProgress[i].type;
                        switch(type){
                            case "Cure": 
                                {
                                    GameRooms.findOne(roomId).playerScores.update( //--------zle
                                {_id: playerId},
                                {$inc: {scores: 1}});
                
                                }break;
                
                            case "Offensive":
                                 {
                                    GameRooms.findOne(roomId).playerScores.update( //--------zle
                                {_id: playerId},
                                {$inc: {scores: -1}});
                
                                }break;
                        }
                }
                 
            }

            //przekazanie ruchu - nextPlayer
            var rawData = GameRooms.findOne({_id: roomId},{fields: {players: 1, turn: 1}});
            var currentPlayer = rawData.turn;
            var nextPlayer;

            for(var i=0; i<rawData.players.count(); i++)
            {
                if(rawData.players[i] == currentPlayer)
                    if(i < rawData.players.count()-1)       //jesli nie ostatni gracz to nastepny
                        nextPlayer = rawData.players[i+1];
                    else                                    //jesli ostani gracz to pierwszy
                        nextPlayer = rawData.players[0];
            }       

            GameRooms.update(roomId, 
            {
                $set:{
                    turn: nextPlayer
                }
            });

            //czyszczenie zmiennych sesji
            Session.set('selected-enemy',false);
            Session.set('selected-action',false);
            Session.set('selected-card',false);
            Session.set('selected-card-id',false);

         }
         else
            console.log('brak wybranej kary/akcji/wroga');

       
    },

    'passTurn': function(roomId,playerId)
    {   check(roomId,String);
        check(playerId,String);

        var gameRoom = GameRooms.findOne(roomId);
        var cardToChange = Session.get('selected-card');
        var rack = gameRoom.playerRacks[playerId];

        if(cardToChange != false)   //opuszczenie ruchu z wymiana losowej karty
        {
             //get a new card for this user
            var letterBag = gameRoom.letterBag;
            //checkLetterBag - sprawdzenie czy nie pusta talia
            var rawData = GameRooms.findOne({_id: roomId},{fields: {letterBag: 1}});
            var letterBag = rawData.letterBag;
            if(letterBag.length == 0)
            {
                letterBag = {
                        'Offensive': 15,
                        'Defence' : 5,
                        'Cure' : 5,
                        'HollowBrick': 5,
                        'NuclearButton': 2,
                        'NuclearBunker': 5,
                        'Globalization': 2,
                    };

                GameRooms.update(roomId,
                {
                    $set:{
                        letterBag: letterBag
                    }
                });
            }

            var newCard = getRandKeyFromCountSet(letterBag);
            var oldIdx = Math.floor((Math.random() * 4)); //losowa liczba 0-4
            rack[oldIdx].letter = newLetter;
        
            gameRoom.playerRacks[playerId] = rack;
        }



        var rawData = GameRooms.findOne({_id: roomId}, {fields: {               //strata zycia za opuszczenie kolejki
            playerScores: 1,
            _id: 0
        }});   

        rawData.playerScores[playerId] = rawData.playerScores[playerId]-1;
        GameRooms.update(roomId, {
                $set: { 
                    playerScores: rawData.playerScores,
                    playerRacks:  gameRoom.playerRacks[playerId]
                }
            });

    },


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