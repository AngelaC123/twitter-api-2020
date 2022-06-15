const express = require('express')
const router = express.Router()
const passport = require('../config/passport')

const userController = require('../controllers/user-controller')

const { apiErrorHandler } = require('../middleware/error-handler')

const { authenticated } = require('../middleware/auth')

router.post('/users', userController.signUp)
router.post('/signin', passport.authenticate('local', { session: false }), userController.signIn)

router.get('/current_user', authenticated, userController.getCurrentUser)

const admin = require('./modules/admin')
const users = require('./modules/users')
const tweets = require('./modules/tweets')
const followships = require('./modules/followships')

router.use('/admin', admin)
router.use('/users', users)
router.use('/tweets', tweets)
router.use('/followships', followships)

router.use('/', apiErrorHandler)

module.exports = router
