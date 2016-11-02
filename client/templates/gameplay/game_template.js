var stage = []; //store piece placements here before sending to the server

Template.gameTemplate.onCreated(function() { 
    //reset session variables ------------------------------------//zmienne
    Session.set('selected-enemy', false);
    Session.set('selected-card', false);
    Session.set('current-turn', false);
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
        
    },

    playerHand: function() {
        
    },

    playersAndLives: function() {
        var rawData = GameRooms.findOne(this._id, {
            fields: {
                players: 1, //array of {ids,usernames}
                playerLives: 1, //object of ids -> scores
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

    enemy: function(){
        
        var enemyList = [];

    }
});

//----------------------------------------------------------------------------zdazenia do modyfikacji
Template.gameTemplate.events({
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
    },

    'click .card': function(e, tmpl) {   //---------------------wybor karty
        e.preventDefault();

        var roomId = Template.parentData(1)._id;
        var rackId = parseInt(e.target.id.split('-')[2]);
        var sl = Session.get('selected-letter');
        var sr = Session.get('selected-rack-item');
        var st = Session.get('selected-tile');
        if (this.letter !== false) {
            if (st !== false) {
                return stagePlacement(roomId, false, rackId, st);
            } else {
                Session.set('selected-letter', false);
                Session.set('selected-rack-item', rackId===sr?false:rackId);
                Session.set('selected-tile', false);
            }
        } else {
            if (st !== false) reclaimLetter(roomId, st, rackId);
        }
    },

    'click #pass-move-btn': function(e, tmpl) {
        e.preventDefault();

        if (confirm('Are you sure you want to pass your turn?')) {
            Meteor.call(
                'makeMove',
                this._id,
                [false],
                function (err, result) {
                    if (err) return Errors.throw(err.reason);

                    if (result.notInRoom) {
                        return Errors.throw(
                            'You\'re not in this game room.'
                        );
                    } else if (result.gameOver && !result.success) {
                        return Errors.throw(
                            'This game is already over.'
                        );
                    } else if (result.notTheirTurn) {
                        return Errors.throw(
                            'It isn\'t your turn!'
                        );
                    } else {
                        //ga
                        ga('send', 'event', 'game', 'move', 'pass');
                        if (result.gameOver) {
                            ga('send', 'event', 'game', 'end');
                        }
                    }
                }
            );
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
