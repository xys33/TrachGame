Meteor.publish('userData', function() {
    return Meteor.users.find({_id: this.userId}, {
        fields: {'currentGameRoom': 1}
    });
});

Meteor.publish('gameRooms', function() {
    return GameRooms.find({});
});

Meteor.publish('singleGameRoom', function(roomId) {
    check(roomId, String);
    return GameRooms.find({_id: roomId});
});

Meteor.publish('messages',function(limit){
	var dl = limit || 10;
	return Messages.find({}, {sort: {time: -1}, limit: 10});
});