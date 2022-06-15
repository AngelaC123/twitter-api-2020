const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const Sequelize = require('sequelize')

const { User, Tweet, Followship, Reply, Like } = require('../models')

const { getUser } = require('../_helpers')

const { imgurFileHandler } = require('../helpers/file-helpers')

const userController = {
  signIn: (req, res, next) => {
    const { account, password } = req.body

    if (!account || !password) throw new Error('帳號和密碼為必填！')

    User.findOne({ where: { account } })
      .then(user => {
        if (!user || user.role === 'admin') throw new Error('帳號不存在！')
        if (!bcrypt.compareSync(password, user.password)) { throw new Error('密碼錯誤！') }
        const userData = user.toJSON()
        delete userData.password
        const token = jwt.sign(userData, process.env.JWT_SECRET, {
          expiresIn: '30d'
        })
        return res.status(200).json({
          token,
          user: userData
        })
      })
      .catch(err => next(err))
  },

  signUp: (req, res, next) => {
    const { account, name, email, password, checkPassword } = req.body
    if (password !== checkPassword) throw new Error('密碼與確認密碼不符！')
    if (!account || !name || !email || !password || !checkPassword) throw new Error('此欄位不可空白！')

    User.findAll({
      $or: [{ where: { email } }, { where: { account } }]
    })
      .then(users => {
        if (users.some(u => u.email === email)) throw new Error('此 Email 已被註冊！')
        if (users.some(u => u.account === account)) throw new Error('此帳號已被註冊！')
        if (name.length > 50 || account.length > 50) throw new Error('字數上限為 50 個字！')

        return bcrypt.hash(password, 10)
      })
      .then(hash => {
        return User.create({
          account,
          name,
          email,
          password: hash,
          role: ''
        })
      })
      .then(newUser => {
        const userData = newUser.toJSON()
        delete userData.password
        const token = jwt.sign(userData, process.env.JWT_SECRET, {
          expiresIn: '30d'
        })
        return res.status(200).json({
          token,
          user: userData
        })
      })
      .catch(err => next(err))
  },

  getUser: (req, res, next) => {
    const UserId = Number(req.params.id)
    const reqUserId = getUser(req).id
    return User.findByPk(UserId, {
      include: [
        { model: User, as: 'Followers' },
        { model: User, as: 'Followings' }
      ]
    })
      .then(onCheckedUser => {
        if (!onCheckedUser || onCheckedUser.role === 'admin') throw new Error('帳號不存在！')
        const userData = onCheckedUser.toJSON()
        userData.followingCount = onCheckedUser.Followings.length
        userData.followerCount = onCheckedUser.Followers.length
        userData.owner = reqUserId === UserId
        userData.isFollowed = getUser(req).Followings.some(f => f.id === onCheckedUser.id)

        delete userData.Followers
        delete userData.Followings
        return res.status(200).json(userData)
      })
      .catch(err => next(err))
  },

  getCurrentUser: (req, res, next) => {
    try {
      const userData = (({ id, account, name, email, avatar, role }) => ({ id, account, name, email, avatar, role }))(getUser(req))
      return res.status(200).json(userData)
    } catch (err) {
      next(err)
    }
  },

  getTopUsers: (req, res, next) => {
    const reqUserId = Number(getUser(req).id)
    return User.findAll({
      include: { model: User, as: 'Followers' },
      attributes: ['id', 'account', 'name', 'avatar', 'createdAt'],
      where: { role: '' }
    })
      .then(users => {
        const result = users
          .map(user => ({
            ...user.toJSON(),
            followerCount: user.Followers.length,
            isFollowed: getUser(req).Followings.some(f => f.id === user.id),
            owner: reqUserId === user.id,
            Followers: ''
          }))
          .sort((a, b) => b.followerCount - a.followerCount || b.createdAt - a.createdAt)
          .slice(0, 10)

        return res.status(200).json(result)
      })
      .catch(err => next(err))
  },

  putUserSetting: (req, res, next) => {
    const { account, name, email, password, checkPassword } = req.body
    const userId = Number(req.params.id)
    const reqUserId = getUser(req).id

    if (userId !== reqUserId) throw new Error('使用者只能修改自己的資料！')
    if (password !== checkPassword) throw new Error('密碼與確認密碼不符！')
    if (!account) throw new Error('帳號欄位不可空白！')
    if (!name) throw new Error('名稱欄位不可空白！')
    if (!email) throw new Error('Email 欄位不可空白！')
    if (!password) throw new Error('密碼欄位不可空白！')
    if (!checkPassword) throw new Error('確認密碼欄位不可空白！')
    if (name.length > 50 || account.length > 50) { throw new Error('字數上限為 50 個字！') }

    return Promise.all([
      User.findAll({ $or: [{ where: { email } }, { where: { account } }] }),
      User.findByPk(userId, {
        attributes: ['id', 'account', 'name', 'email', 'password', 'createdAt']
      }),
      bcrypt.hash(password, 10)
    ])
      .then(([checkUsers, user, hash]) => {
        if (!user) throw new Error('帳號不存在！')
        if (checkUsers.some(u => u.email === email && u.id !== reqUserId)) throw new Error('此 Email 已被註冊！')
        if (checkUsers.some(u => u.account === account && u.id !== reqUserId)) throw new Error('此帳號已被註冊！')
        return user.update({
          account,
          name,
          email,
          password: hash
        })
      })
      .then(updatedUser => res.status(200).json(updatedUser))
      .catch(err => next(err))
  },

  putUser: (req, res, next) => {
    const UserId = Number(req.params.id)
    const reqUser = Number(getUser(req).id)

    const { name, introduction } = req.body
    const { files } = req
    if (!name || !introduction) throw new Error('名字和自介欄位不可空白！')
    if (name.length > 50) throw new Error('名稱欄位字數上限為 50 個字！')
    if (introduction.length > 160) throw new Error('自介欄位字數上限為 160 個字！')

    const avatar = files?.avatar ? files.avatar[0] : null
    const cover = files?.cover ? files.cover[0] : null

    Promise.all([
      User.findByPk(UserId),
      imgurFileHandler(avatar),
      imgurFileHandler(cover)
    ])
      .then(([user, avatar, cover]) => {
        return user.update({
          name,
          introduction,
          avatar: avatar || reqUser.avatar,
          cover: cover || reqUser.cover
        })
      })
      .then(updatedUser => res.status(200).json(updatedUser))
      .catch(err => next(err))
  },

  getUsersTweets: (req, res, next) => {
    const UserId = Number(req.params.id)
    Promise.all([
      Tweet.findAll({
        where: { UserId },
        attributes: {
          include: [
            [Sequelize.literal('(SELECT COUNT(DISTINCT id) FROM Replies WHERE Tweet.id = Replies.Tweet_id )'), 'replyCount'],
            [Sequelize.literal('(SELECT COUNT(DISTINCT id) FROM Likes WHERE Tweet.id = Likes.Tweet_id)'), 'likeCount']
          ]
        },
        include: [
          { model: User, as: 'TweetUser', attributes: ['id', 'name', 'account', 'avatar'] }
        ],
        order: [['createdAt', 'DESC']],
        raw: true,
        nest: true
      }),
      User.findByPk(UserId)
    ])

      .then(([tweets, user]) => {
        if (!user) throw new Error('使用者不存在！')
        if (tweets.length <= 0) return res.status(200).json({ message: '該使用者沒有推文！' })
        const likedTweetId = getUser(req)?.LikedTweets ? getUser(req).LikedTweets.map(l => l.id) : []
        const tweetList = tweets.map(data => ({
          ...data,
          isLiked: likedTweetId.some(item => item === data.id)
        }))
        res.status(200).json(tweetList)
      })
      .catch(err => next(err))
  },

  getUsersReplies: (req, res, next) => {
    const UserId = Number(req.params.id)
    Promise.all([
      Reply.findAll({
        where: { UserId },
        attributes: ['id', 'UserId', 'TweetId', 'comment', 'createdAt', 'updatedAt'],
        include: [
          { model: User, as: 'ReplyUser', attributes: ['id', 'name', 'account', 'avatar'] },
          {
            model: Tweet,
            include: [{ model: User, as: 'TweetUser', attributes: ['id', 'name', 'account'] }]
          }
        ],
        order: [['createdAt', 'DESC']],
        raw: true,
        nest: true
      }),
      User.findByPk(UserId)
    ])
      .then(([replies, user]) => {
        if (!user) throw new Error('使用者不存在！')
        if (replies.length <= 0) return res.status(200).json({ message: '該使用者沒有回覆！' })
        const replyList = replies.map(data => ({
          ...data,
          Tweet: { id: data.Tweet.id },
          TweetUser: data.Tweet.TweetUser
        }))
        return res.status(200).json(replyList)
      })
      .catch(err => next(err))
  },

  getUsersLikes: (req, res, next) => {
    const UserId = Number(req.params.id)

    Promise.all([
      Like.findAll({
        where: { UserId },
        attributes: ['id', 'UserId', 'TweetId', 'createdAt', 'updatedAt'],
        include: [
          {
            model: Tweet,
            attributes: [
              'id',
              'description',
              [Sequelize.literal('(SELECT COUNT(DISTINCT id) FROM Replies WHERE Tweet.id = Replies.Tweet_id )'), 'replyCount'],
              [Sequelize.literal('(SELECT COUNT(DISTINCT id) FROM Likes WHERE Tweet.id = Likes.Tweet_id)'), 'likeCount']
            ],
            include: [
              {
                model: User,
                as: 'TweetUser',
                attributes: ['id', 'name', 'account', 'avatar']
              }
            ]
          }
        ],
        order: [['createdAt', 'DESC']],
        raw: true,
        nest: true
      }),
      User.findByPk(UserId)
    ])

      .then(([likes, user]) => {
        if (!user) throw new Error('使用者不存在！')
        if (likes.length <= 0) return res.status(200).json({ message: '該使用者沒有Like任何推文!' })
        const likedTweetId = getUser(req)?.LikedTweets ? getUser(req).LikedTweets.map(l => l.id) : []
        const likeList = likes.map(data => ({
          ...data,
          Tweet: {
            id: data.Tweet.id,
            description: data.Tweet.description,
            likeCount: data.Tweet.likeCount,
            replyCount: data.Tweet.replyCount
          },
          TweetUser: data.Tweet.TweetUser,
          isLiked: likedTweetId.some(item => item === data.Tweet.id)
        }))
        res.status(200).json(likeList)
      })
      .catch(err => next(err))
  },

  getFollowings: (req, res, next) => {
    User.findByPk(req.params.id, {
      include: { model: User, as: 'Followings', attributes: [['id', 'followingId'], 'name', 'account', 'avatar', 'introduction'] },
      order: [['Followings', Followship, 'createdAt', 'DESC']]
    })

      .then(user => {
        if (!user.Followings.length) res.status(200).json({ message: '該使用者沒有正在追隨清單!' })

        const followingId = getUser(req)?.Followings ? getUser(req).Followings.map(f => f.id) : []
        const followingList = user.Followings.map(f => ({
          ...f.toJSON(),
          isFollowed: followingId.some(id => id === f.id),
          Followship: ''
        }))
        return res.status(200).json(followingList)
      })
      .catch(err => next(err))
  },

  getFollowers: (req, res, next) => {
    User.findByPk(req.params.id, {
      include: { model: User, as: 'Followers', attributes: [['id', 'followerId'], 'name', 'account', 'avatar', 'introduction'] },
      order: [['Followers', Followship, 'createdAt', 'DESC']]
    })

      .then(user => {
        if (!user.Followers.length) res.status(200).json({ message: '該使用者沒有追隨者!' })

        const followingId = getUser(req)?.Followings ? getUser(req).Followings.map(f => f.id) : []
        const followerList = user.Followers.map(f => ({
          ...f.toJSON(),
          isFollowed: followingId.some(id => id === f.id),
          Followship: ''
        }))
        return res.status(200).json(followerList)
      })
      .catch(err => next(err))
  },

  addFollowing: (req, res, next) => {
    const followingId = Number(req.body.id)
    const followerId = getUser(req).id
    if (followingId === followerId) throw new Error('不能追蹤自己!')
    return Promise.all([
      User.findByPk(followingId),
      Followship.findOne({
        where: {
          followingId,
          followerId
        }
      })
    ])
      .then(([user, isFollowed]) => {
        if (!user) throw new Error('使用者不存在!')
        if (isFollowed) throw new Error('你已經追蹤該名使用者，不能重複追蹤！')
        return Followship.create({
          followingId,
          followerId
        })
      })
      .then(following => {
        res.status(200).json({ message: '已成功追隨該使用者！', following })
      })
      .catch(err => next(err))
  },

  removeFollowing: (req, res, next) => {
    const followingId = Number(req.params.id)
    const followerId = getUser(req).id
    if (followingId === followerId) throw new Error('不能取消追蹤自己!')
    return Promise.all([
      User.findByPk(followingId),
      Followship.findOne({
        where: {
          followingId,
          followerId
        }
      })
    ])
      .then(([user, isFollowed]) => {
        if (!user) throw new Error('無法取消追蹤不存在的使用者!')
        if (!isFollowed) throw new Error('你尚未追蹤該名使用者，不能取消追蹤！')
        return isFollowed.destroy()
      })
      .then(removeFollowing => res.status(200).json({ message: '已成功取消追隨該使用者！', removeFollowing }))
      .catch(err => next(err))
  }
}

module.exports = userController
