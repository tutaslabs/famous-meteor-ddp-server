if (Meteor.isClient) {

    Meteor.subscribe('chat');
    Meteor.subscribe('counter');

    Router.route('/', function () {
        this.render('enterChat');
    });

    Template.enterChat.events({
        'click #ebtn': function (evt, tmpl) {

            d = tmpl.find("#tfield").value

            Chat.insert({text: d})

            id = Counter.find({}).fetch();
            id = id[0]._id
            Counter.update({_id: id}, {$inc: {count: 1}})


            $("#tfield").val("")
        },
        'click #rbtn': function (evt, tmpl) {

           Meteor.call('reset');

        }

    })

    Template.items.helpers(
        {
            items: function () {
                return query = Chat.find({});
            }
        }
    )

    Template.chatItemContent.events({
        'click #ibtn': function (evt, tmpl) {
            t = this._id;
            Chat.remove({ _id: t});

            id = Counter.find({}).fetch();
            id = id[0]._id;
            Counter.update({_id: id}, {$inc: {count: -1}});
        },
        'click #ubtn': function (evt, tmpl) {
            d = $("#tfield").val()
            t = this._id;
            Chat.update({ _id: t},{$set : {text: d}});
            $("#tfield").val("");
        }
    })
}

