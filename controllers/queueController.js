const Queue = require('../models/queue');

// Add player to queue

exports.join_queue_get = (req, res, next) => {
  console.log(req.authData.user.displayName)
  Queue.findOneAndUpdate(
    {mode: 'classic'}, 
    {$push: 
      {
        players: {
          _id: req.authData.user.id,
        }
      }
    },
    (err, docs) => {
      if (err) {return next(err);}
      res.json(docs);
    }
  )
}