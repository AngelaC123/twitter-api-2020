const express = require('express')
const router = express.Router()

const tweetController = require('../../controllers/tweet-controller')

const { authenticated, authenticatedUser } = require('../../middleware/auth')

router.use(authenticated, authenticatedUser)

router.get('/:tweet_id/replies', tweetController.getTweetReplies)
router.post('/:tweet_id/replies', tweetController.postTweetReply)
router.get('/:tweet_id', tweetController.getTweet)
router.post('/:id/like', tweetController.addLike)
router.post('/:id/unlike', tweetController.addUnlike)

router.get('/', tweetController.getTweets)
router.post('/', tweetController.postTweet)

module.exports = router
