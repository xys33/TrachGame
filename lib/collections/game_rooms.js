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
    var playerScores = playerIds.map(function(playerId) {
        return [playerId, updatedRoom.playerScores[playerId]]
    });
    var bestScore = playerScores.reduce(function(acc, scorePair) {
        return acc[1] > scorePair[1] ? acc : scorePair;
    });
    var winnerName = updatedRoom.players[
        playerIds.indexOf(bestScore[0])
    ].username;
    GameRooms.update(roomId, {
        $set: {
            winner: {
                username: winnerName,
                score: bestScore[1]
            },
            turn: false
        }
    });
check([roomId,playerId,targ,sAction,type,cardId], [Match.Any]);
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
                playersFlags[players[i]._id].nuclearBunker = false;
            }

            GameRooms.update(roomId,
            {
                $set:{
                    playerScores: playerScores,
                    playersFlags: playersFlags,
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


    'cure': function(roomId,init,targ,t){ //---------------------------popsute
        check(roomId,String);
        check(init,String);
        check(targ,Match.Any);
        check(t,String);

        if(targ == false)
            targ = init;

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
/*
    'globalization': function(roomId,sAction){
        check(roomId,String);
        check(sAction,String);


        var rawData = GameRooms.findOne({_id: roomId},{fields: {actionsInProgress: 1,players: 1}});
        var targets = rawData.players;
        var sel_action;

        for(var i=0; i< rawData.actionsInProgress.count(); i++ )
        {
            if(rawData.actionsInProgress[i]._id == sAction)
                sel_action = rawData.actionsInProgress[i]._id;
        }
        init  = sel_action.initiator;
        type = sel_action.type;

        rawData.actionsInProgress.splice(sAction, 1);

        GameRooms.update(roomId,
        {
            $set: {
                actionsInProgress: rawData.actionsInProgress,
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
*/
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
                //'Globalization': 2,
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
                    var handCard = getRandKeyFromCountSet(letterBag);
                    rack.push({
                        _id: ai,
                        letter: handCard,
                    });
                }

                playerRacks[gameRoom.players[pi]._id] = rack;
                playerScores[gameRoom.players[pi]._id] = 5; //-------------------5 zyc dla gracza
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

    'makeMove': function(roomId,playerId,targ,sAction,type,cardId){
        
        check([roomId,playerId,targ,sAction,type,cardId], [Match.Any]);

        var init = playerId;
        

        if(type != false)
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

                     if(sAction !=0){ //-----------------------------------------------wybrana akcja

                            Meteor.call('defence', roomId, sAction, function(err, result) {
                                if (err) return Errors.throw(err.reason);
                            });
                        }

                } break;

                
                case "HollowBrick":{ //pustak
                    console.log("brawo uzyles pustaka! dzieje sie... nic");
                } break;

               
                case "NuclearButton":{ //guzik atomow
                    Meteor.call('nuclearButton',roomId,function(err, result) {
                                if (err) return Errors.throw(err.reason);
                            });
                } break;

                case "NuclearBunker":{ //schron
                    if(targ == false)
                        targ = init;

                    Meteor.call('nuclearBunker',roomId,targ,function(err, result) {
                                if (err) return Errors.throw(err.reason);
                            });
                } break;

               /* case "Globalization":{ //globalizacja--------------------------------------------------------
                    
                        Meteor.call('globalization',roomId,sAction,function(err, result) {
                                if (err) return Errors.throw(err.reason);
                            });
                    
                } break;
				*/
                case "Cure":{

                    Meteor.call('cure',roomId,init,targ,type,function(err,result){
                            if(err) return Errors.throw(err.reason);
                    });

                }break;

                default: 
                console.log(type,'niespodzianka!!! cos poszlo nie tak');

            }

            // losowanie nowej karty
            
            //checkLetterBag - sprawdzenie czy nie pusta talia
                var rawData = GameRooms.findOne({_id: roomId},{fields: {letterBag: 1, playerRacks: 1}});
                var letterBag = rawData.letterBag;
                var rack = rawData.playerRacks[playerId];
                if(letterBag.length == 0)
                {
                    letterBag = {
                            'Offensive': 15,
                            'Defence' : 5,
                            'Cure' : 5,
                            'HollowBrick': 5,
                            'NuclearButton': 2,
                            'NuclearBunker': 5,
                            //'Globalization': 2,
                        };

                    GameRooms.update(roomId,
                    {
                        $set:{
                            letterBag: letterBag
                        }
                    });
                }
            var newCard = getRandKeyFromCountSet(letterBag);
            rack[cardId].letter = newCard;
            rawData.playerRacks[playerId] = rack;

            

            GameRooms.update(roomId, 
            {
                $set:{
                    playerRacks: rawData.playerRacks,
                }
            });


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
                        var rawData = GameRooms.findOne({_id: roomId}, {fields: {               //rozliczenie zyc
                                                                _id: 0
                                                            }});   
                        switch(type){
                            case "Cure": 
                                {
                                    rawData.playerScores[playerId] = rawData.playerScores[playerId]+1;
                                }break;
                
                            case "Offensive":
                                 {
                                    rawData.playerScores[playerId] = rawData.playerScores[playerId]-1;
                                }break;
                        }

                        // usuniecie akcji z listy
                        rawData.actionsInProgress.splice(i, 1);

                }
    
            }

            GameRooms.update(roomId, {
                                            $set: { 
                                                playerScores: rawData.playerScores,
                                                actionsInProgress: rawData.actionsInProgress,
                                            }
                                        });

            

         }
         else
            console.log('brak wybranej kary/akcji/wroga');
/*
         //check for the no more alive enemies
        var rawData = GameRooms.findOne({_id:roomId},{fields: {playerScores: 1,players: 1}});
        var noMoreEnemies=0;//rawData.reduce(function(total,x){return x.playerScores==0 ? total+1 : total}, 0);
        var playerId;
        for(var i=0; i<rawData.playerScores.length;i++)
        {   
            playerId = rawData.players[i];
            console.log(playerId);
            console.log(rawData.players[i]);
            console.log(rawData.playerScores[playerId]);
            if(rawData.playerScores[playerId]>0)
                noMoreEnemies++;
        }
        if (noMoreEnemies<2) 
            return endGame(roomId); //if less than 2 alive end game
*/
        //przekazanie ruchu - nextPlayer
            var rawData = GameRooms.findOne({_id: roomId},{fields: {players: 1, turn: 1,playerScores: 1}});
            //var currentPlayer = rawData.turn;
            var counter=0;
            do{
                var rawData = GameRooms.findOne({_id: roomId},{fields: {players: 1, turn: 1,playerScores: 1}});
               //advance the turn to the next player
            
            var idxInPlayers = rawData.players.reduce(function(ret, player, idx) {
                return rawData.turn === player._id ? idx : ret;
            }, false);
            var idxNextPlayer = (idxInPlayers+1)%rawData.players.length;
            var nextTurn = rawData.players[idxNextPlayer]._id;

            //console.log(currentPlayer,rawData.turn,nextTurn,rawData.players);
            GameRooms.update(roomId, 
            {
                $set:{
                    turn: nextTurn,
                }
            });
            counter++;
             }while(rawData.playerScores[nextTurn]<=0 && counter<=rawData.players.length)

            if(counter == rawData.players.length)
                return endGame(roomId);
            //czyszczenie zmiennych sesji
            // w evencie

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
                        //'Globalization': 2,
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
            rack[oldIdx].letter = newCard;
        
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