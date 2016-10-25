var stage = []; //store piece placements here before sending to the server

Template.gameTemplate.onCreated(function() { 
    //reset session variables ------------------------------------//te zmienne nam nie pasuja, beda inne (kieyds)
    Session.set('selected-letter', false);
    Session.set('selected-rack-item', false);
    Session.set('selected-tile', false);
    Session.set('current-turn', false);
});

Template.gameTemplate.onRendered(function() {
    document.addEventListener('keydown', function(e) {
        var selLetter = String.fromCharCode(e.keyCode);
        var sl = Session.get('selected-letter');
        var sr = Session.get('selected-rack-item');
        var st = Session.get('selected-tile');
        if (st !== false) {
            var roomId = Router.current().params._id;
            return stagePlacement(roomId, selLetter, false, st);
        } else {
            Session.set('selected-letter', selLetter);
            Session.set('selected-rack-item', false);
            Session.set('selected-tile', false);
        }
    });
});

//----------------------------------------------------------------------------zdazenia do modyfikacji
Template.gameTemplate.events({
    'click .tile-elem, click .tile-letter': function(e, tmpl) {
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

    'click .rack-letter': function(e, tmpl) {
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

    'click #recall-btn': function(e, tmpl) {
        e.preventDefault();

        //get the game data you need
        var gameData = GameRooms._collection.findOne(this._id, {
            fields: {
                playerRacks: 1,
                tiles: 1
            }
        }); //search local collection?
        var tiles = gameData.tiles;
        var rack = gameData.playerRacks[Meteor.userId()];

        //undo all the staged changes
        var stageIdx = 0;
        for (var ri = 0; ri < rack.length && stageIdx < stage.length; ri++) {
            if (rack[ri].letter === false) {
                rack[ri].letter = stage[stageIdx][1];
                rack[ri].score = LETTER_PTS[rack[ri].letter.toLowerCase()];
                tiles[stage[stageIdx][0]].letter = false;
                tiles[stage[stageIdx][0]].score = false;
                stageIdx++;
            }
        }
        stage = [];

        //send the undone version back to the minimongo collection
        var propsToUpdate = {
            tiles: tiles
        };
        propsToUpdate['playerRacks.'+Meteor.userId()] = rack;
        GameRooms._collection.update(this._id, {
            $set: propsToUpdate
        });

        //remove all selections
        Session.set('selected-letter', false);
        Session.set('selected-rack-item', false);
        Session.set('selected-tile', false);
    },

    'click #submit-move-btn': function(e, tmpl) {
        e.preventDefault();

        Meteor.call(
            'makeMove',
            this._id,
            stage,
            function(err, result) {
                if (err) return Errors.throw(err.reason);

                if (result.notInRoom) {
                    return Errors.throw(
                        'You\'re not in this game room.'
                    );
                } else if (result.gameOver) {
                    return Errors.throw(
                        'This game is already over.'
                    );
                } else if (result.notTheirTurn) {
                    return Errors.throw(
                        'It isn\'t your turn!'
                    );
                } else if (result.invalidRackId) {
                    return Errors.throw(
                        'One of the letters you\'ve selected is invalid.'
                    );
                } else if (result.invalidTileId) {
                    return Errors.throw(
                        'You can only place letters on empty tiles.'
                    );
                } else if (result.mustPlaceCenter) {
                    return Errors.throw(
                        'The first word has to go through the center.'
                    );
                } else if (result.doesNotBranch) {
                    return Errors.throw(
                        'New words need to branch off of old words.'
                    );
                } else if (result.notALine) {
                    return Errors.throw(
                        'All of your letters need to be in a single line.'
                    );
                } else if (result.notConnected) {
                    return Errors.throw(
                        'All of your letters need to be connected.'
                    );
                } else if (!!result.notAWord) {
                    return Errors.throw(
                        'The following words were invalid: '+
                        result.notAWord.join(', ')
                    );
                } else if (result.success) {
                    stage = []; //clear the stage; these changes will live on!

                    //ga
                    ga('send', 'event', 'game', 'move','word');
                    if (result.gameOver) {
                        ga('send', 'event', 'game', 'end');
                    }
                }
            }
        );
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
