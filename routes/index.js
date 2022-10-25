const express = require('express');
const router = express.Router();

router.get('/', function(req, res, next) {
  res.render('index');
})

router.get('/sign-up', (req, res) => res.render('sign-up-form'));

module.exports = router;