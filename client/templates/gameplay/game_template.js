var stage = []; //store piece placements here before sending to the server

var enemiesListGen = function() //lista wrogow
    {
        
        var rawData = GameRooms.findOne(this._id,{
            fields: {
                players: 1
            }});

        var enemiesList = [];
        if (!rawData || !rawData.players) return enemiesList;
        for(var ei =0; ei < rawData.players.length; ei++)
        {
            if(rawData.players[ei]._id != Meteor.userId())
                enemiesList.push({
                    _id:    rawData.players[ei]._id,
                    username: rawData.players[ei].username
                });
        }
       // console.log("enemieslist",enemiesList);
        return enemiesList;
    };

var id2name = function(roomId,id)
{
    var name;
    var rawData = GameRooms.findOne(roomId,{fields: {players: 1}});
    //console.log(rawData.players);
    //console.log(rawData.players);
    for(var i=0;i<rawData.players.length;i++)
    {
        if(rawData.players[i]._id == id)
            name = rawData.players[i].username;
    }
    //console.log(name);
    return name;
};

function stagePlacement(roomId, letter, rackId, tileId) {
    if (tileId === false) return Errors.throw('Select a tile first.');
    else if (letter === false && rackId === false) {
        return Errors.throw('Select a rack letter first.');
    }

    //get the current room's data
    var gameData = GameRooms.findOne(roomId, {
        fields: {
            playerRacks: 1,
            tiles: 1,
            turn: 1
        }
    });

    //can only place on their turn
    if (gameData.turn !== Meteor.userId()) {
        return Errors.throw('It isn\'t your turn!');
    }

    //bunch of convenience variables
    var tiles = gameData.tiles;
    var rack = gameData.playerRacks[Meteor.userId()];
    var rackLetter = letter ? letter : rack[rackId].letter;
    var tileLetter = tiles[tileId].letter;

    //deal with the few different tile-rack cases
    if (rackLetter !== false && tileLetter !== false) {
        return Errors.throw('There\'s already a letter in that tile.');
    } else if (rackLetter !== false && tileLetter === false) {
        //find the rack id if you have to
        if (rackId === false) {
            for (var ai = 0; ai < rack.length; ai++) {
                var rawRackLtr = rack[ai].letter;
                var rackLtr = rawRackLtr ? rawRackLtr.toUpperCase() : rawRackLtr;
                var lettersMatch = letter === rackLtr;
                if (lettersMatch && rackLtr !== false) {
                    rackId = ai;
                    break;
                }
            }
            if (rackId === false) return;
        }

        //update the LOCAL collection after placing the letter
        tiles[tileId].letter = rackLetter;
        tiles[tileId].score = rack[rackId].score;
        rack[rackId].letter = false;
        rack[rackId].score = false;
        var propsToUpdate = {
            tiles: tiles
        };
        propsToUpdate['playerRacks.'+Meteor.userId()] = rack;
        GameRooms._collection.update(roomId, {
            $set: propsToUpdate
        });

        //remember your changes so you can undo them later
        stage.push([tileId, rackLetter]);

        //get the next tile id
        var nextTileId = false;
        if (stage.length >= 2) {
            var axisAligned = [0, 1].map(function(axis) {
                return stage.map(function(placement) {
                    return [
                        placement[0]%15,
                        Math.floor(placement[0]/15)
                    ];
                }).reduce(function(acc, coords, idx) {
                    if (idx === 0) return [coords, true];
                    else {
                        return [coords, coords[axis]===acc[0][axis]&&acc[1]];
                    }
                }, false)[1];
            });
            var tileX = tileId%15;
            var tileY = Math.floor(tileId/15);
            if (axisAligned[0]) tileY = Math.min(tileY+1, 14);
            else if (axisAligned[1]) tileX = Math.min(tileX+1, 14);

            nextTileId = tileX+15*tileY;
            if (nextTileId === tileId) nextTileId = false;
        }

        //update session variables
        Session.set('selected-letter', false);
        Session.set('selected-rack-item', false);
        Session.set('selected-tile', nextTileId);
    }
}

function reclaimLetter(roomId, tileId, rackId) {
    //get the current room's data
    var gameData = GameRooms.findOne(roomId, {
        fields: {
            playerRacks: 1,
            tiles: 1
        }
    });
    var rack = gameData.playerRacks[Meteor.userId()];

    var stageChangeIdx = stage.reduce(function(ans, change, idx) {
        return change[0] === tileId ? idx : ans;
    }, false);
    if (stageChangeIdx !== false) {
        //it was a staged change so reclaim the letter
        rack[rackId].letter = gameData.tiles[tileId].letter;
        rack[rackId].score = gameData.tiles[tileId].score;
        gameData.tiles[tileId].letter = false;
        gameData.tiles[tileId].score = false;
        var propsToUpdate = {
            tiles: gameData.tiles
        };
        propsToUpdate['playerRacks.'+Meteor.userId()] = rack;
        GameRooms._collection.update(roomId, {
            $set: propsToUpdate
        });

        //remove this change from the stage
        stage.splice(stageChangeIdx, 1);
    } else { //otherwise tell them they can't reclaim it
        return Errors.throw('That\'s not your letter to reclaim.');
    }
}

Template.gameTemplate.onCreated(function() {
    //reset session variables
    Session.set('selected-letter', false);
    Session.set('selected-rack-item', false);
    Session.set('selected-tile', false);

    Session.set('current-turn', false);

    Session.set('selected-enemy',false); //------------------------------------wybrany wrog
    Session.set('selected-action',false); //-----------------------------------wybrana akcja
    Session.set('selected-card',false); //-------------------------------------wybrana karta
    Session.set('selected-card-id',false); 

    
});

Template.gameTemplate.onRendered(function() {
    document.addEventListener('keydown', function(e) {
        var selLetter = String.fromCharCode(e.keyCode);
        var se = Session.get('selected-enemy');
        var sc = Session.get('selected-card');

            Session.set('selected-enemy', false);
            Session.set('selected-rack-item', false);
            Session.set('selected-tile', false);
    });
});

Template.gameTemplate.helpers({
    gameData: function() {

        var rawData = GameRooms.findOne(this._id, {
            fields: {
                title: 1,
                turn: 1,
                move: 1,
                winner: 1
            }
        });
        if (!rawData) return [];

        //detect turn changes
        if (rawData.turn !== Session.get('current-turn')) {
            if (Session.get('current-turn') !== false) {
                var beep = new Audio('/audio/beep.mp3');
                beep.play();
            }
            var turnPref = 'YOUR TURN - ';
            if (document.title.indexOf(turnPref) === 0) { //already there
                if (rawData.turn !== Meteor.userId()) { //not them
                    document.title = document.title.substring(
                        turnPref.length
                    ); //get rid of it
                }
            } else { //it isn't there
                if (rawData.turn === Meteor.userId()) { //it is them
                    document.title = turnPref+document.title;
                }
            }

            Session.set('current-turn', rawData.turn);
        }

        return {
            title: rawData.title || 'Game board',
            winner: rawData.winner
        };
    },

    playerRack: function() {
        var rawData = GameRooms.findOne(this._id, {
            fields: {
                playerRacks: 1
            }
        });

        var rack = rawData.playerRacks[Meteor.userId()];
        if (!rack) return [];

        return rack;
    },

    playersAndScores: function() {
        var rawData = GameRooms.findOne(this._id, {
            fields: {
                players: 1, //array of {ids,usernames}
                playerScores: 1, //object of ids -> scores
                turn: 1
            }
        });
        var playerList = [];
        if (!rawData || !rawData.players) return playerList;
        for (var pi = 0; pi < rawData.players.length; pi++) {
            var playersId = rawData.players[pi]._id;
            playerList.push({
                username: rawData.players[pi].username,
                score: rawData.playerScores[playersId],
                isTurn: rawData.turn === playersId ? 'is-turn':''
            });
        }
        return playerList;
    },

    actionsList: function(){ //lista akcji 

        roomId = this._id;
        var rawData = GameRooms.findOne(roomId,{
            fields: {
                actionsInProgress: 1,
                players: 1
            }
        });
       // console.log("actionsList rawData",rawData);

        var actionsInProgress = [];

        if (!rawData || !rawData.actionsInProgress) return actionsInProgress;
        for(var ai=0; ai < rawData.actionsInProgress.length; ai++)
        {
            actionsInProgress.push({
                _id: rawData.actionsInProgress[ai]._id,
                active: rawData.actionsInProgress[ai].active,
                initiator: rawData.actionsInProgress[ai].initiator,
                initiatorName: id2name(roomId,rawData.actionsInProgress[ai].initiator),
                target: rawData.actionsInProgress[ai].target,
                targetName: id2name(roomId,rawData.actionsInProgress[ai].target),
                type: rawData.actionsInProgress[ai].type
            });
        }
        //console.log("actionsList return",actionsInProgress);
        return actionsInProgress;
    }, 

    selectedClass: function(){

        var itemId = this.id;
        var selected_enemy = Session.get('selected-enemy');
        var selected_action = Session.get('selected-action');

        if(itemId == selected_enemy || itemId == selected_action)
            return "selected";
        else
            return "";

    },

    enemiesListGen: enemiesListGen


});

Template.gameTemplate.events({
    /*
    'click .enemy': function(e, tmpl) { //-------------wybor osoby atakowanej
        e.preventDefault();

        var roomId = Template.parentData(1)._id;
        var tileId = parseInt(e.target.id.split('-')[1]);
        var sl = Session.get('selected-letter');
        var sr = Session.get('selected-rack-item');
        var st = Session.get('selected-tile');

        if (sr !== false && st === false) {
            return stagePlacement(roomId, false, sr, tileId);
        } else if (sl !== false && st === false) {
            return stagePlacement(roomId, sl, false, tileId);
        } else {
            Session.set('selected-letter', false);
            Session.set('selected-rack-item', false);
            Session.set('selected-tile', tileId === st ? false : tileId);
        }
    },*/

    'click .clear-btn':function(e,tmpl){
        e.preventDefault();

        Session.set('selected-enemy',false);
        Session.set('selected-action',false);
        Session.set('selected-card',false);

    },

    'click .card': function(e, tmpl) {   //---------------------funkcje kart
        e.preventDefault();

        Session.set('selected-card',this.letter);
        Session.set('selected-card-id',this._id);
        console.log(Session.get('selected-card'),Session.get('selected-card-id'));
    },    

    'click .enemy-btn': function(e,tmpl){ //wybranie wroga
        e.preventDefault();

        var enemyId = this._id;
        Session.set('selected-enemy',enemyId);
        //console.log(Session.get('selected-enemy'));
        
    },

    'click .action-btn': function(e,tmpl){ // wybranie akcji do modyfikacji
        e.preventDefault();

        var actionId = this._id;
        Session.set('selected-action',actionId);
        //console.log(Session.get('selected-action'));
    },

    'click #execute-btn':function(e,tmpl){ //wykonanie akcji zgodnie z wybranymi zmiennymi sesji
        e.preventDefault();

        if(Session.get('current-turn')==Meteor.userId())
        {
            var playerId = Meteor.userId();
            var targ = Session.get('selected-enemy');
            var sAction = Session.get('selected-action'); 
            var type = Session.get('selected-card');    
            var cardId = Session.get('selected-card-id'); 

                 Meteor.call('makeMove',Template.parentData(1)._id,playerId,targ,sAction,type,cardId, function(err, result) {
                                if (err) return Errors.throw(err.reason);
                            });

            Session.set('selected-enemy',false);
            Session.set('selected-action',false);
            Session.set('selected-card',false);
            Session.set('selected-card-id',false);
            //console.log('execute-btn');
        }
        else
            console.log('not your turn');



    },

    'click #pass-turn-btn': function(e,tmpl){
        e.preventDefault();

        if(confirm('Are you sure you want to pass your turn?'))
        {
                var roomId = Template.parentData(1)._id;
                Meteor.call('passTurn',roomId,Meteor.userId(),function(err, result){});
        }

    },

    'click #forfeit-btn': function(e, tmpl) {
        e.preventDefault();

        if (confirm('Are you sure you want to forfeit?')) {
            Meteor.call('removeJoinAuth', function (err, result) {
                if (err) return Errors.throw(err.reason);

                if (result.notLoggedOn) {
                    return Errors.throw(
                        'You\'re not logged in.'
                    );
                } else if (result.notInRoom) {
                    return Errors.throw(
                        'You need to be in a room to forfeit.'
                    );
                } else if (result.success) {
                    //ga
                    ga('send', 'event', 'game', 'forfeit');

                    Router.go('home');
                }
            });
        }
    }
});

