const express = require('express')
const router = express.Router()

const upload = require('../../middleware/multer')

const userController = require('../../controllers/user-controller')
const { authenticated, authenticatedUser } = require('../../middleware/auth')

router.use(authenticated, authenticatedUser)

router.get('/top', userController.getTopUsers)

router.get('/:id/tweets', userController.getUsersTweets)
router.get('/:id/replied_tweets', userController.getUsersReplies)
router.get('/:id/likes', userController.getUsersLikes)
router.get('/:id/followings', userController.getFollowings)
router.get('/:id/followers', userController.getFollowers)

router.put('/:id/setting', userController.putUserSetting)
router.put('/:id', upload.fields([{ name: 'cover', maxCount: 1 }, { name: 'avatar', maxCount: 1 }]), userController.putUser)

router.get('/:id', userController.getUser)

module.exports = router
