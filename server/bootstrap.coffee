


Meteor.startup  ->

  Meteor.publish 'chat', ->
    Chat.find()
  Meteor.publish 'counter', ->
    Counter.find()

  if Chat.find().count() is 0
    for x in [0..10]
      Chat.insert text: 'This is line '+x

  if Counter.find().count() is 0
    Counter.insert {c: 'c',count: 1}
  Counter.update {c: 'c'},{count: Chat.find().count()}

Meteor.methods
    addChat: (payload) ->
      Chat.insert(payload);
      id = Counter.find({}).fetch();
      id = id[0]._id
      Counter.update({_id: id}, {$inc: {count: 1}})

    removeChat: (id) ->
      Chat.remove _id: id,
          (error,res) =>
            if error
              throw new Meteor.Error(404, error.sanitizedError)
              return error
            else
              return ''
      id = Counter.find({}).fetch();
      id = id[0]._id
      Counter.update {_id: id},{$inc: {count: -1}}
    getlist: () ->
      return Chat.find().fetch();
    getCount: () ->
      return Counter.findOne({c: 'c'});
    reset: () ->

      Chat.remove {}
      for x in [0..2]
        Chat.insert text: 'This is line '+x
      id = Counter.find({}).fetch();
      id = id[0]._id
      Counter.update {_id: id},{count: 3}

