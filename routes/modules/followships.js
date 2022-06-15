const express = require('express')
const router = express.Router()

const userController = require('../../controllers/user-controller')

const { authenticated, authenticatedUser } = require('../../middleware/auth')

router.use(authenticated, authenticatedUser)

router.post('/', userController.addFollowing)
router.delete('/:id', userController.removeFollowing)

module.exports = router
