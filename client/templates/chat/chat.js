if (Meteor.isClient) {
    Template.messages.helpers({
        messages: function() {
            return Messages.find({}, { sort: { time: -1}});
        }
    });

    Template.input.events = {
      'keydown input#message' : function (event) {
        if (event.which == 13) { // 13 is the enter key event
          if (Meteor.user())
            var name = Meteor.user().username;
          else
            var name = 'Anonymous';

          var message = document.getElementById('message');
          console.log(Meteor.user().username, message);
          if (message.value != '') {
            Meteor.call('insertMessage',name,message.value,function(err, result) {
                if (err) return Errors.throw(err.reason);
            });

            //document.getElementById('message').value = '';
            message.value = '';
          }
        }
      }
    }
}


